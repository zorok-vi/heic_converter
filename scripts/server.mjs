import './check-node.cjs';
import http from 'node:http';
import { realpath, stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8' };
export const CSP = "default-src 'none'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export function parseArgs(args) {
  let port = 8080;
  let open = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') open = false;
    else if (args[i] === '--port' && /^\d{1,5}$/.test(args[i + 1] ?? '')) {
      port = Number(args[++i]);
      if (port < 1024 || port > 65535) throw new Error('Порт должен быть от 1024 до 65535.');
    } else throw new Error('Использование: npm start -- --port 8081 (порт 1024–65535).');
  }
  return { port, open };
}

const within = (base, file) => file !== base && file.startsWith(base + path.sep);
export async function createStaticServer(directory, port) {
  const base = await realpath(directory);
  const files = new Set();
  // The build creates this allowlist; no repository files can be served accidentally.
  const entries = JSON.parse(await readFile(path.join(base, 'static-files.json'), 'utf8'));
  for (const entry of entries) if (typeof entry === 'string') files.add('/' + entry);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const fail = (code) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(http.STATUS_CODES[code]); };
    const listeningPort = server.address()?.port ?? port;
    if (req.headers.host !== `127.0.0.1:${listeningPort}`) return fail(403);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return fail(405); }
    try {
      const raw = req.url ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//')) return fail(400);
      let pathname = decodeURIComponent(raw.split('?')[0]);
      if (/[\\\x00-\x1f\x7f]/.test(pathname) || pathname.split('/').some(s => s === '.' || s === '..')) return fail(403);
      if (pathname === '/') pathname = '/index.html';
      if (!files.has(pathname)) return fail(404);
      const target = path.resolve(base, '.' + pathname);
      if (!within(base, target)) return fail(403);
      const real = await realpath(target);
      if (!within(base, real)) return fail(403);
      const info = await stat(real);
      if (!info.isFile()) return fail(404);
      const type = mime[path.extname(real).toLowerCase()];
      if (!type) return fail(404);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(real);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else fail(error instanceof URIError ? 400 : 404);
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

function openBrowser(url) {
  const program = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(program, args, { stdio: 'ignore', shell: false, windowsHide: true });
  const notice = () => console.log('Не удалось открыть браузер. Откройте адрес выше вручную.');
  child.once('error', notice);
  child.once('exit', code => { if (code) notice(); });
  return child;
}

export async function main(args = process.argv.slice(2)) {
  const { port, open } = parseArgs(args);
  let server;
  try { server = await createStaticServer(root, port); }
  catch { throw new Error('Сборка dist отсутствует или повреждена. Выполните setup.bat или ./setup.sh.'); }
  let opener;
  const stop = () => {
    if (opener && opener.exitCode === null && !opener.killed) opener.kill();
    server.close();
    server.closeAllConnections();
  };
  await new Promise((resolve, reject) => {
    server.once('error', e => reject(new Error(e.code === 'EADDRINUSE'
      ? `Порт ${port} занят. Выберите другой: npm start -- --port 8081. Посторонний процесс не изменён.`
      : `Не удалось запустить локальный сервер (${e.code ?? 'ошибка'}).`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(`HEIC → JPEG / PNG: http://127.0.0.1:${port}\nОстановка: Ctrl+C. Закрытие вкладки не останавливает сервер.`);
  if (open) opener = openBrowser(`http://127.0.0.1:${port}`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
