import { LIMITS } from '../config';
import type { Limits } from '../config';
import { Cancelled, ConversionClient } from '../conversion/client';
import type { Converted, Settings } from '../conversion/types';
import { fingerprint, outputName, validateFile } from '../utils/files';

export type JobState = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';
export type Result = Converted & { url: string; name: string; settings: Settings };
export type Job = { id: string; file: File; state: JobState; message?: string; result?: Result };
export type QueueState = {
  jobs: Job[]; busy: boolean; preparing: boolean; notice: string;
  batchIds: string[]; paused: boolean;
};

export class Queue {
  private state: QueueState = { jobs: [], busy: false, preparing: false, notice: '', batchIds: [], paused: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  constructor(private client = new ConversionClient(), private limits: Limits = LIMITS,
    private urls = { create: (blob: Blob) => URL.createObjectURL(blob), revoke: (url: string) => URL.revokeObjectURL(url) }) {}

  getSnapshot = (): QueueState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<QueueState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); }
  private patchJob(id: string, patch: Partial<Job>): void { this.update({ jobs: this.state.jobs.map(j => j.id === id ? { ...j, ...patch } : j) }); }
  private release(job: Job): void { if (job.result) this.urls.revoke(job.result.url); }

  add(files: File[]): void {
    if (this.state.busy) return;
    const jobs = [...this.state.jobs];
    const known = new Set(jobs.map(j => fingerprint(j.file)));
    let total = jobs.reduce((n, j) => n + j.file.size, 0);
    const messages: string[] = [];
    for (const file of files) {
      const key = fingerprint(file);
      if (known.has(key)) { messages.push(`${file.name}: повтор пропущен (совпадают имя, размер и дата).`); continue; }
      const error = validateFile(file, jobs.length, total, this.limits);
      if (error) { messages.push(`${file.name}: ${error}`); continue; }
      known.add(key); total += file.size;
      jobs.push({ id: crypto.randomUUID(), file, state: 'queued' });
    }
    this.update({ jobs, notice: messages.join('\n'), batchIds: [], paused: false });
  }

  async start(settings: Settings, mode: 'queued' | 'retry' | 'all' = 'queued'): Promise<void> {
    if (this.state.busy) return;
    if (!['jpeg', 'png'].includes(settings.format) || !Number.isInteger(settings.quality) || settings.quality < 10 || settings.quality > 100) return;
    const targets = this.state.jobs.filter(j => mode === 'all' || (mode === 'retry' ? j.state === 'error' || j.state === 'cancelled' : j.state === 'queued'));
    if (!targets.length) return;
    const config = { ...settings };
    const ids = targets.map(j => j.id);
    for (const job of targets) this.release(job);
    const runId = ++this.generation;
    this.update({ busy: true, preparing: true, notice: '', paused: false, batchIds: ids,
      jobs: this.state.jobs.map(j => ids.includes(j.id) ? { ...j, state: 'queued', result: undefined, message: undefined } : j) });
    for (const target of targets) {
      if (runId !== this.generation) return;
      this.patchJob(target.id, { state: 'processing' });
      this.update({ preparing: true });
      try {
        const result = await this.client.run({ runId, jobId: target.id, file: target.file, settings: config }, this.limits.timeoutMs,
          () => { if (this.generation === runId) this.update({ preparing: false }); });
        if (runId !== this.generation) return;
        const stored = this.state.jobs.reduce((n, j) => n + (j.result?.blob.size ?? 0), 0);
        if (stored + result.blob.size > this.limits.resultBytes) {
          this.update({ busy: false, preparing: false, paused: true,
            notice: 'Достигнут бюджет результатов. Последний результат отброшен. Скачайте готовые файлы, удалите ненужные результаты и нажмите «Конвертировать», чтобы продолжить.',
            jobs: this.state.jobs.map(j => j.id === target.id ? { ...j, state: 'queued', message: 'Не хватает бюджета результатов; задание приостановлено.' } : j) });
          return;
        }
        const name = outputName(target.file.name, config.format, this.state.jobs.flatMap(j => j.result ? [j.result.name] : []));
        this.patchJob(target.id, { state: 'done', result: { ...result, name, settings: config, url: this.urls.create(result.blob) }, message: undefined });
      } catch (error) {
        if (runId !== this.generation) return;
        this.patchJob(target.id, { state: error instanceof Cancelled ? 'cancelled' : 'error',
          message: error instanceof Cancelled ? 'Операция отменена.' : error instanceof Error ? error.message : 'Не удалось обработать файл.' });
      }
    }
    if (runId === this.generation) this.update({ busy: false, preparing: false });
  }

  cancel(): void {
    if (!this.state.busy) return;
    ++this.generation;
    this.client.cancel();
    this.update({ busy: false, preparing: false, notice: 'Конвертация отменена. Готовые результаты сохранены.',
      jobs: this.state.jobs.map(j => j.state === 'queued' || j.state === 'processing' ? { ...j, state: 'cancelled', message: 'Отменено пользователем.' } : j) });
  }

  remove(id: string): void {
    if (this.state.busy) return;
    const job = this.state.jobs.find(j => j.id === id);
    if (job) this.release(job);
    this.update({ jobs: this.state.jobs.filter(j => j.id !== id), batchIds: this.state.batchIds.filter(j => j !== id) });
  }

  discardResult(id: string): void {
    if (this.state.busy) return;
    const job = this.state.jobs.find(j => j.id === id);
    if (job?.result) { this.release(job); this.patchJob(id, { result: undefined, state: 'cancelled', message: 'Результат удалён. Для новой обработки повторите отменённые или конвертируйте всё заново.' }); }
  }

  clear(): void {
    ++this.generation;
    this.client.cancel();
    this.state.jobs.forEach(j => this.release(j));
    this.update({ jobs: [], busy: false, preparing: false, notice: '', batchIds: [], paused: false });
  }
  dispose(): void { this.clear(); this.listeners.clear(); }
}
