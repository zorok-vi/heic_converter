import { describe, expect, it } from 'vitest';
import { fingerprint, outputName, safeStem, validateFile } from '../../src/utils/files';
import { LIMITS } from '../../src/config';
import { validateDimensions } from '../../src/conversion/adapter';
import { file } from './fakes';

describe('проверки файлов, имён и лимитов', () => {
  it('сохраняет русские имена и нумерует коллизии без учёта регистра', () => {
    expect(outputName('Мой снимок.HEIC', 'jpeg', [])).toBe('Мой снимок.jpg');
    expect(outputName('Фото.heif', 'png', ['фото.png', 'Фото (2).png'])).toBe('Фото (3).png');
    expect(outputName('photo.heic', 'jpeg', ['photo.jpg', 'photo (2).jpg'])).toBe('photo (3).jpg');
  });
  it.each(['../../фото.heic', '..\\..\\фото.heic', '\u0000photo.heic', 'con.heic', '...heic', '<img>.heic'])('очищает опасное имя %s', name => {
    const stem = safeStem(name);
    expect(stem).not.toMatch(/[/\\\x00-\x1f<>]|\.\./);
    expect(stem).not.toMatch(/^(con|nul|prn|aux)$/i);
    expect(stem.length).toBeGreaterThan(0);
  });
  it('принимает пустой MIME и верхний регистр расширения', () => expect(validateFile(file('PHOTO.HEIF'), 0, 0, LIMITS)).toBeUndefined());
  it('отклоняет пустой файл и неподходящее расширение', () => {
    expect(validateFile(file('photo.heic', 0), 0, 0, LIMITS)).toContain('пуст');
    expect(validateFile(file('photo.png'), 0, 0, LIMITS)).toContain('расширением');
  });
  it('проверяет отдельный размер, общий размер и число файлов', () => {
    const large = file(); Object.defineProperty(large, 'size', { value: LIMITS.fileBytes + 1 });
    expect(validateFile(large, 0, 0, LIMITS)).toContain('одного файла');
    expect(validateFile(file(), 0, LIMITS.sourceBytes - 3, LIMITS)).toContain('суммарный');
    expect(validateFile(file(), LIMITS.files, 0, LIMITS)).toContain('количества');
    expect(validateFile(file(), LIMITS.files - 1, LIMITS.sourceBytes - 4, LIMITS)).toBeUndefined();
  });
  it('использует имя, размер и дату только как эвристику дублей', () => {
    expect(fingerprint(file())).toBe(fingerprint(file()));
    expect(fingerprint(file())).not.toBe(fingerprint(file('фото.heic', 4, 124)));
  });
  it.each([[0, 1], [-1, 100], [NaN, 1], [Infinity, 2], [1.5, 5], [10000, 5001]])('проверяет пиксели %s × %s', (w, h) => expect(() => validateDimensions(w, h)).toThrow());
  it('допускает ровно 50 Мп', () => expect(() => validateDimensions(10000, 5000)).not.toThrow());
});
