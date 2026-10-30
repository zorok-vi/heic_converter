import type { ConvertRequest, ConvertResponse, Converted } from './types';

export interface WorkerLike {
  onmessage: ((event: MessageEvent<ConvertResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ConvertRequest): void;
  terminate(): void;
}
export type WorkerFactory = () => WorkerLike;
export class Cancelled extends Error {}

export class ConversionClient {
  private stop?: () => void;
  constructor(private factory: WorkerFactory = () => new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module', name: 'heic-converter' })) {}

  run(request: ConvertRequest, timeout: number, onReady: () => void): Promise<Converted> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = this.factory();
      let settled = false;
      const finish = (result?: Converted, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
        worker.terminate(); // also stops the decoder's nested Worker
        this.stop = undefined;
        if (result) resolve(result); else reject(error);
      };
      const timer = setTimeout(() => finish(undefined, new Error('Обработка превысила 120 секунд. Worker остановлен; можно повторить попытку.')), timeout);
      this.stop = () => finish(undefined, new Cancelled());
      worker.onmessage = event => {
        const response = event.data;
        if (settled || response.runId !== request.runId || response.jobId !== request.jobId) return;
        if (response.phase === 'ready') onReady();
        else if (response.phase === 'done') finish(response.result);
        else if (response.phase === 'error') finish(undefined, new Error(response.message));
      };
      worker.onerror = () => finish(undefined, new Error('Ошибка Worker. Используйте актуальный Chrome/Edge; файл может быть повреждён или требовать слишком много памяти.'));
      worker.onmessageerror = () => finish(undefined, new Error('Не удалось получить данные от Worker.'));
      try { worker.postMessage(request); }
      catch { finish(undefined, new Error('Не удалось запустить конвертацию в Worker.')); }
    });
  }

  cancel(): void { this.stop?.(); }
}
