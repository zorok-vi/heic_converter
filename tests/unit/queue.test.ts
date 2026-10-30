import { afterEach, expect, it, vi } from 'vitest';
import { LIMITS } from '../../src/config';
import { file, flush, harness, settings } from './fakes';

afterEach(() => vi.useRealTimers());

it('обрабатывает последовательно, продолжает после ошибки и не повторяет готовые', async () => {
  const h = harness(); h.queue.add([file('one.heic'), file('two.heic'), file('three.heic')]);
  const run = h.queue.start(settings);
  expect(h.workers).toHaveLength(1);
  h.workers[0].done(); await flush();
  expect(h.workers).toHaveLength(2);
  h.workers[1].error(); await flush();
  h.workers[2].done(); await run;
  expect(h.queue.getSnapshot().jobs.map(j => j.state)).toEqual(['done', 'error', 'done']);
  const retry = h.queue.start(settings, 'retry'); h.workers[3].done(); await retry;
  expect(h.queue.getSnapshot().jobs.every(j => j.state === 'done')).toBe(true);
  expect(h.workers).toHaveLength(4);
  h.queue.dispose();
});

it('фиксирует параметры и состав партии при старте', async () => {
  const h = harness(); h.queue.add([file(), file('other.heic')]);
  const config = { format: 'jpeg', quality: 90 } as const;
  const mutable = { ...config, quality: 90 };
  const run = h.queue.start(mutable); mutable.quality = 10;
  h.queue.add([file('ignored.heic')]); h.queue.remove(h.queue.getSnapshot().jobs[0].id);
  expect(h.queue.getSnapshot().jobs).toHaveLength(2);
  h.workers[0].done(); await flush();
  expect(h.workers[1].request?.settings.quality).toBe(90);
  h.workers[1].done(); await run;
  expect(h.queue.getSnapshot().jobs[0].result?.settings.quality).toBe(90);
  h.queue.dispose();
});

it('отмена завершает Worker, сохраняет готовое и позволяет повторить остальные', async () => {
  const h = harness(); h.queue.add([file(), file('b.heic'), file('c.heic')]);
  const run = h.queue.start(settings); h.workers[0].done(); await flush();
  const stale = h.workers[1].onmessage!;
  h.queue.cancel(); await run;
  expect(h.workers[1].terminate).toHaveBeenCalledOnce();
  expect(h.queue.getSnapshot().jobs.map(j => j.state)).toEqual(['done', 'cancelled', 'cancelled']);
  stale({ data: { ...h.workers[1].request, phase: 'error', message: 'устаревшее' } } as never);
  expect(h.queue.getSnapshot().jobs[1].state).toBe('cancelled');
  const retry = h.queue.start(settings, 'retry'); h.workers[2].done(); await flush(); h.workers[3].done(); await retry;
  expect(h.queue.getSnapshot().jobs.every(j => j.state === 'done')).toBe(true); h.queue.dispose();
});

it('не принимает неверные runId/jobId и освобождает URL после очистки/нового запуска', async () => {
  const h = harness(); h.queue.add([file()]); const run = h.queue.start(settings);
  const worker = h.workers[0];
  worker.emit({ runId: -1, jobId: worker.request!.jobId, phase: 'error', message: 'устаревшее' });
  worker.emit({ runId: worker.request!.runId, jobId: 'чужое', phase: 'error', message: 'чужое' });
  expect(h.queue.getSnapshot().jobs[0].state).toBe('processing');
  worker.done(); await run; h.queue.clear();
  expect(h.urls.revoke).toHaveBeenCalledOnce();
  h.queue.add([file()]); expect(h.queue.getSnapshot().jobs).toHaveLength(1);
  const again = h.queue.start(settings); h.workers[1].done(); await again; h.queue.dispose();
  expect(h.urls.revoke).toHaveBeenCalledTimes(2);
});

it('очистка активной операции отбрасывает устаревший ответ и не мешает новой партии', async () => {
  const h = harness(); h.queue.add([file()]); const old = h.queue.start(settings);
  const stale = h.workers[0].onmessage!, request = h.workers[0].request!;
  h.queue.clear(); h.queue.add([file()]); const run = h.queue.start(settings);
  stale({ data: { runId: request.runId, jobId: request.jobId, phase: 'error', message: 'old' } } as never);
  expect(h.queue.getSnapshot().jobs[0].state).toBe('processing');
  h.workers[1].done(); await Promise.all([old, run]); h.queue.dispose();
});

it('тайм-аут завершает Worker и создаёт новый для следующего файла', async () => {
  vi.useFakeTimers(); const h = harness({ ...LIMITS, timeoutMs: 25 });
  h.queue.add([file(), file('b.heic')]); const run = h.queue.start(settings);
  await vi.advanceTimersByTimeAsync(26);
  expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  expect(h.queue.getSnapshot().jobs[0].state).toBe('error');
  expect(h.workers).toHaveLength(2); h.workers[1].done(); await run; h.queue.dispose();
});

it('при бюджете результатов приостанавливает накопление, не удаляет готовое и возобновляется', async () => {
  const h = harness({ ...LIMITS, resultBytes: 7 });
  h.queue.add([file(), file('b.heic'), file('c.heic')]); const run = h.queue.start(settings);
  h.workers[0].done(4); await flush(); h.workers[1].done(4); await run;
  expect(h.workers).toHaveLength(2);
  expect(h.queue.getSnapshot().paused).toBe(true);
  expect(h.queue.getSnapshot().jobs.map(j => j.state)).toEqual(['done', 'queued', 'queued']);
  expect(h.urls.revoke).not.toHaveBeenCalled();
  h.queue.remove(h.queue.getSnapshot().jobs[0].id);
  const resume = h.queue.start(settings); h.workers[2].done(3); await flush(); h.workers[3].done(4); await resume;
  expect(h.queue.getSnapshot().jobs.every(j => j.state === 'done')).toBe(true);
  h.queue.dispose();
});

it('пропускает дубли, допускает одинаковые имена разных файлов и освобождает результат', async () => {
  const h = harness(); h.queue.add([file(), file(), file('фото.heic', 5)]);
  expect(h.queue.getSnapshot().jobs).toHaveLength(2); expect(h.queue.getSnapshot().notice).toContain('повтор');
  const run = h.queue.start(settings); h.workers[0].done(); await flush(); h.workers[1].done(); await run;
  expect(h.queue.getSnapshot().jobs.map(j => j.result?.name)).toEqual(['фото.jpg', 'фото (2).jpg']);
  h.queue.discardResult(h.queue.getSnapshot().jobs[0].id);
  expect(h.urls.revoke).toHaveBeenCalledOnce(); expect(h.queue.getSnapshot().jobs[0].state).toBe('cancelled');
  const repeat = h.queue.start({ format: 'png', quality: 90 }, 'all');
  expect(h.urls.revoke).toHaveBeenCalledTimes(2);
  h.workers[2].done(); await flush(); h.workers[3].done(); await repeat; h.queue.dispose();
});
