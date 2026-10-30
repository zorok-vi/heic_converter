import type { Result } from '../queue/Queue';

export async function buildZip(results: Result[], signal: AbortSignal, progress: (done: number) => void): Promise<Blob> {
  const { BlobReader, BlobWriter, ZipWriter } = await import('@zip.js/zip.js/lib/zip-core-custom.js');
  signal.throwIfAborted();
  // STORE: JPEG/PNG are already compressed. No ZIP codec, WASM or extra Worker is needed.
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0, useWebWorkers: false, useCompressionStream: false });
  try {
    for (let i = 0; i < results.length; i++) {
      signal.throwIfAborted();
      const result = results[i];
      await writer.add(result.name, new BlobReader(result.blob), { signal, lastModDate: new Date(2026, 0, 1), extendedTimestamp: false });
      progress(i + 1);
    }
    signal.throwIfAborted();
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}
