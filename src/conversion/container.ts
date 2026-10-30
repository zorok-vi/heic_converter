// Inspect ISO BMFF ftyp, including compatible brands. Generic mif1 is not proof of HEVC.
export async function checkHeicContainer(file: Blob): Promise<void> {
  const data = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const view = new DataView(data.buffer);
  const text = (start: number) => String.fromCharCode(...data.subarray(start, start + 4));
  if (data.length < 16 || text(4) !== 'ftyp') throw new Error('Это не контейнер HEIC/HEIF. Проверьте содержимое файла.');
  let size = view.getUint32(0);
  let start = 8;
  if (size === 1) {
    if (data.length < 24) throw new Error('Повреждён заголовок HEIC.');
    const large = view.getBigUint64(8);
    if (large > BigInt(4096)) throw new Error('Неподдерживаемый заголовок HEIC.');
    size = Number(large);
    start = 16;
  }
  if (size < start + 8 || size > data.length || (size - start) % 4 !== 0) throw new Error('Повреждён заголовок HEIC.');
  const brands = [text(start)];
  for (let offset = start + 8; offset < size; offset += 4) brands.push(text(offset));
  if (brands.some(b => b === 'avif' || b === 'avis')) throw new Error('AVIF не поддерживается. Выберите фотографию HEIC/HEIF с кодеком HEVC.');
  if (['hevc', 'hevx', 'msf1'].includes(brands[0])) throw new Error('Последовательности HEIF и видео не поддерживаются. Выберите статичный HEIC.');
  if (!brands.some(b => b === 'heic' || b === 'heix')) throw new Error('Этот вариант HEIF не поддерживается. Нужен статичный HEIC с кодеком HEVC.');
}
