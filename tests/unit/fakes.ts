import { vi } from 'vitest';
import { ConversionClient } from '../../src/conversion/client';
import type { WorkerLike } from '../../src/conversion/client';
import type { ConvertRequest, ConvertResponse, Converted } from '../../src/conversion/types';
import { Queue } from '../../src/queue/Queue';
import { LIMITS } from '../../src/config';

export class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  onmessageerror: WorkerLike['onmessageerror'] = null;
  request?: ConvertRequest;
  terminate = vi.fn();
  postMessage(request: ConvertRequest) { this.request = request; }
  emit(data: ConvertResponse) { this.onmessage?.({ data } as MessageEvent<ConvertResponse>); }
  done(size = 4) { this.emit({ runId: this.request!.runId, jobId: this.request!.jobId, phase: 'done', result: converted(size) }); }
  error() { this.emit({ runId: this.request!.runId, jobId: this.request!.jobId, phase: 'error', message: 'Повреждённый файл.' }); }
}
export const converted = (size = 4): Converted => ({ blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), width: 2, height: 2 });
export const file = (name = 'фото.heic', size = 4, date = 123) => new File([new Uint8Array(size)], name, { lastModified: date });
export const settings = { format: 'jpeg', quality: 90 } as const;
export const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
export function harness(limits = LIMITS) {
  const workers: FakeWorker[] = [];
  const client = new ConversionClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const urls = { create: vi.fn(() => `blob:test-${Math.random()}`), revoke: vi.fn() };
  const queue = new Queue(client, limits, urls);
  return { queue, client, workers, urls };
}
