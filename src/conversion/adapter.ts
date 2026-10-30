import type { Converted, Settings } from './types';
import { LIMITS } from '../config';
import { checkHeicContainer } from './container';

export function validateDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > LIMITS.pixels) {
    throw new Error('Разрешение превышает 50 мегапикселей или некорректно.');
  }
}

export async function convert(file: File, settings: Settings, onReady: () => void): Promise<Converted> {
  await checkHeicContainer(file);
  // csp's bitmap branch is Worker-safe: no document/canvas DOM APIs are used.
  // next requires unsafe-eval in its nested decoder and fails our production CSP.
  const { heicTo } = await import('heic-to/csp');
  onReady();
  const bitmap = await heicTo({ blob: file, type: 'bitmap' });
  let canvas: OffscreenCanvas | undefined;
  try {
    const { width, height } = bitmap;
    validateDimensions(width, height);
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает конвертацию в Worker. Используйте актуальный Chrome или Edge.');
    if (settings.format === 'jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0);
    const mime = `image/${settings.format}`;
    const blob = await canvas.convertToBlob({ type: mime, ...(settings.format === 'jpeg' ? { quality: settings.quality / 100 } : {}) });
    if (blob.type !== mime || !blob.size) throw new Error('Браузер не смог закодировать выбранный формат.');
    return { blob, width, height };
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
