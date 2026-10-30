export const MiB = 1024 * 1024;
export const LIMITS = {
  files: 20, fileBytes: 30 * MiB, sourceBytes: 150 * MiB,
  pixels: 50_000_000, resultBytes: 200 * MiB, timeoutMs: 120_000,
};
export type Limits = typeof LIMITS;
