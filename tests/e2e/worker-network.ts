import type { Browser, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Use a separate CDP connection to intercept both dedicated and nested Workers
// before they execute, without relying on page/context request interception.
export async function guardWorkers(browser: Browser, page: Page, origin: string) {
  const cdp = await browser.newBrowserCDPSession();
  const { arguments: args } = await cdp.send('Browser.getBrowserCommandLine');
  const profile = args.find(arg => arg.startsWith('--user-data-dir='))!.slice('--user-data-dir='.length);
  const [port, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
  const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('CDP socket unavailable')), { once: true }); });
  const pageSession = await page.context().newCDPSession(page);
  const { targetInfo } = await pageSession.send('Target.getTargetInfo');
  const requests: { url: string; method: string; body: boolean }[] = [];
  const violations: string[] = [], workers: string[] = [], failures: string[] = [];
  let id = 0;
  const pending = new Map<number, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
  function send(method: string, params: object = {}, sessionId?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const commandId = ++id;
      pending.set(commandId, { resolve, reject });
      socket.send(JSON.stringify({ id: commandId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (message.error) item?.reject(new Error(message.error.message)); else item?.resolve(message.result);
    } else if (message.method === 'Network.requestWillBeSent') {
      const { request } = message.params;
      const url = new URL(request.url);
      const allowed = ['blob:', 'data:'].includes(url.protocol) || (url.origin === origin && ['GET', 'HEAD'].includes(request.method) && !request.hasPostData);
      requests.push({ url: request.url, method: request.method, body: !!request.hasPostData });
      if (!allowed) violations.push(request.url);
    } else if (message.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = message.params;
      workers.push(targetInfo.type + ':' + targetInfo.url);
      void (async () => {
        try {
          await send('Target.autoAttachRelated', { targetId: targetInfo.targetId, waitForDebuggerOnStart: true, filter: [{ type: 'worker' }, { exclude: true }] });
          await send('Network.enable', {}, sessionId);
          await send('Network.setBlockedURLs', { urls: [], urlPatterns: [
            { urlPattern: origin + '/*', block: false },
            { urlPattern: 'http://*/*', block: true }, { urlPattern: 'https://*/*', block: true },
          ] }, sessionId);
        } finally { await send('Runtime.runIfWaitingForDebugger', {}, sessionId); }
      })().catch(error => failures.push(error.message));
    }
  });
  await send('Target.autoAttachRelated', { targetId: targetInfo.targetId, waitForDebuggerOnStart: true, filter: [{ type: 'worker' }, { exclude: true }] });
  return { requests, violations, workers, failures,
    liveWorkers: async () => {
      const targets = await send('Target.getTargets') as { targetInfos: { type: string }[] };
      return targets.targetInfos.filter(target => target.type === 'worker').length;
    },
    close: async () => { socket.close(); await cdp.detach(); await pageSession.detach(); } };
}
