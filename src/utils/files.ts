import type { Limits } from '../config';
import type { Settings } from '../conversion/types';

export function fingerprint(file: File): string {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}

export function validateFile(file: File, count: number, total: number, limits: Limits): string | undefined {
  if (!/\.(heic|heif)$/i.test(file.name)) return 'Выберите файл с расширением .heic или .heif.';
  if (!file.size) return 'Файл пуст.';
  if (file.size > limits.fileBytes) return 'Оригинал превышает лимит размера одного файла.';
  if (count >= limits.files) return 'Достигнут лимит количества файлов в очереди.';
  if (file.size + total > limits.sourceBytes) return 'Превышен суммарный лимит оригиналов.';
}

export function safeStem(name: string): string {
  let stem = name.replace(/\.[^.]*$/, '').replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, '_')
    .replace(/\.{2,}/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120);
  if (!stem) stem = 'image';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  return stem;
}

export function outputName(name: string, format: Settings['format'], used: Iterable<string>): string {
  const occupied = new Set(Array.from(used, s => s.toLocaleLowerCase('ru-RU').normalize('NFC')));
  const stem = safeStem(name);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  let candidate = `${stem}.${ext}`;
  for (let n = 2; occupied.has(candidate.toLocaleLowerCase('ru-RU').normalize('NFC')); n++) candidate = `${stem} (${n}).${ext}`;
  return candidate;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  return size < 1024 * 1024 ? `${(size / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КиБ`
    : `${(size / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МиБ`;
}

export function settingsLabel(settings: Settings): string {
  return settings.format === 'png' ? 'PNG' : `JPEG · ${settings.quality}%`;
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return a.format === b.format && (a.format === 'png' || a.quality === b.quality);
}
