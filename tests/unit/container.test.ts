import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { checkHeicContainer } from '../../src/conversion/container';

function ftyp(major: string, compatible: string[]) {
  const data = new Uint8Array(16 + compatible.length * 4);
  new DataView(data.buffer).setUint32(0, data.length);
  data.set(new TextEncoder().encode('ftyp' + major), 4);
  compatible.forEach((brand, i) => data.set(new TextEncoder().encode(brand), 16 + i * 4));
  return new Blob([data]);
}
it('принимает настоящий HEIC и совместимый бренд heic при major mif1', async () => {
  await expect(checkHeicContainer(new Blob([await readFile('tests/fixtures/landscape.heic')]))).resolves.toBeUndefined();
  await expect(checkHeicContainer(ftyp('mif1', ['heic']))).resolves.toBeUndefined();
});
it('не принимает AVIF, generic HEIF, видео и переименованный PNG', async () => {
  await expect(checkHeicContainer(ftyp('avif', ['mif1']))).rejects.toThrow('AVIF');
  await expect(checkHeicContainer(ftyp('mif1', ['avif', 'heic']))).rejects.toThrow('AVIF');
  await expect(checkHeicContainer(ftyp('mif1', []))).rejects.toThrow('вариант');
  await expect(checkHeicContainer(ftyp('hevc', ['heic']))).rejects.toThrow('видео');
  await expect(checkHeicContainer(new Blob([await readFile('tests/fixtures/renamed.heic')]))).rejects.toThrow('контейнер');
});
it('обрабатывает расширенный размер ftyp и отклоняет повреждённую длину', async () => {
  const data = new Uint8Array(24); const view = new DataView(data.buffer);
  view.setUint32(0, 1); view.setBigUint64(8, 24n);
  data.set(new TextEncoder().encode('ftyp'), 4); data.set(new TextEncoder().encode('heic'), 16);
  await expect(checkHeicContainer(new Blob([data]))).resolves.toBeUndefined();
  view.setBigUint64(8, 100000n);
  await expect(checkHeicContainer(new Blob([data]))).rejects.toThrow();
});
