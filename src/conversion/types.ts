export type Settings = { format: 'jpeg' | 'png'; quality: number };
export type Converted = { blob: Blob; width: number; height: number };
export type ConvertRequest = { runId: number; jobId: string; file: File; settings: Settings };
export type ConvertResponse = { runId: number; jobId: string } & (
  { phase: 'ready' } | { phase: 'done'; result: Converted } | { phase: 'error'; message: string }
);
