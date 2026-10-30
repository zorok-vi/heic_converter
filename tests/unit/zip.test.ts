import { expect, it } from 'vitest';
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js/lib/zip-core-custom.js';
import { buildZip } from '../../src/utils/zip';
import type { Result } from '../../src/queue/Queue';

it('ZIP сохраняет русские уникальные имена и точное содержимое записей', async () => {
  const blobs = [new Blob(['one']), new Blob(['two'])];
  const results = blobs.map((blob, i) => ({ blob, name: i === 0 ? 'фото.jpg' : 'фото (2).jpg' })) as Result[];
  const progress: number[] = [];
  const archive = await buildZip(results, new AbortController().signal, count => progress.push(count));
  const reader = new ZipReader(new BlobReader(archive), { useWebWorkers: false });
  const entries = await reader.getEntries();
  expect(entries.map(e => e.filename)).toEqual(['фото.jpg', 'фото (2).jpg']);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]; if (entry.directory) throw new Error('Unexpected directory');
    const content = await entry.getData!(new Uint8ArrayWriter());
    expect(content).toEqual(new Uint8Array(await blobs[i].arrayBuffer()));
  }
  expect(progress).toEqual([1, 2]); await reader.close();
});

it('прерывает сборку ZIP по сигналу', async () => {
  const task = new AbortController(); task.abort();
  await expect(buildZip([], task.signal, () => undefined)).rejects.toThrow();
});
