import { test, expect } from '@playwright/test';
import type { Page, Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js/lib/zip-core-custom.js';
import { guardWorkers } from './worker-network';
import { assertSourceGps } from './metadata';

const origin = 'http://127.0.0.1:8089';
const fixture = (name: string) => path.resolve('tests/fixtures', name + '.heic');
const rows = (page: Page) => page.locator('.file-row');
async function add(page: Page, names: string[]) { await page.getByLabel('Фотографии HEIC или HEIF').setInputFiles(names.map(fixture)); }
async function convert(page: Page) {
  await page.getByRole('button', { name: /^Конвертировать \(/ }).click();
  await expect(page.getByRole('button', { name: 'Выбрать файлы' })).toBeEnabled();
}
async function downloaded(download: Download): Promise<Buffer> { return readFile((await download.path())!); }
async function saveResult(page: Page, index = 0) {
  const event = page.waitForEvent('download'); await rows(page).nth(index).getByRole('link', { name: /^Скачать / }).click();
  const download = await event; return { bytes: await downloaded(download), name: download.suggestedFilename() };
}
async function inspect(page: Page, index = 0) {
  return rows(page).nth(index).locator('img').evaluate(async image => {
    await (image as HTMLImageElement).decode();
    const bitmap = await createImageBitmap(image as HTMLImageElement);
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const colors = [[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y]) => Array.from(context.getImageData(Math.floor(width*x), Math.floor(height*y), 1, 1).data));
    bitmap.close(); canvas.width = 1; canvas.height = 1;
    return { width, height, colors };
  });
}
const red = [230,30,30,255], green = [26,200,51,255], blue = [30,70,230,255], yellow = [245,210,30,255];
function closeColor(actual: number[], expected: number[]) { actual.forEach((v,i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(12)); }

test.beforeEach(async ({ context, page }) => {
  // Fresh context/cache per test, only the exact loopback origin can be reached.
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['blob:', 'data:'].includes(url.protocol)) return route.continue();
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || request.postDataBuffer()) return route.abort('blockedbyclient');
    return route.continue();
  });
  page.on('dialog', dialog => dialog.accept());
});

test('чистый профиль, без внешней сети: первый Worker, JPEG, PNG, скачивание и ZIP', async ({ page, browser, context }) => {
  const attempted: string[] = [], errors: string[] = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol)) {
      expect(url.origin).toBe(origin); expect(['GET', 'HEAD']).toContain(request.method()); expect(request.postDataBuffer()).toBeNull();
      attempted.push(url.pathname);
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  expect(attempted.some(url => url.includes('heic-to'))).toBe(false);
  const guard = await guardWorkers(browser, page, origin);
  try {
    await add(page, ['landscape']); await convert(page);
    await expect(rows(page).first()).toHaveAttribute('data-state', 'done');
    const jpeg = await saveResult(page); expect(jpeg.name).toBe('landscape.jpg'); expect([...jpeg.bytes.subarray(0,3)]).toEqual([255,216,255]);
    const image = await inspect(page); expect([image.width,image.height]).toEqual([160,96]); closeColor(image.colors[0],red);
    await page.getByRole('button', { name: 'Очистить список' }).click();
    await page.getByRole('radio', { name: 'PNG' }).check();
    await expect(page.getByRole('slider')).toHaveCount(0);
    await add(page, ['landscape']); await convert(page);
    const png = await saveResult(page); expect([...png.bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
    const archiveEvent = page.waitForEvent('download'); await page.getByRole('button', { name: /^Скачать ZIP/ }).click();
    const archive = await archiveEvent; expect(archive.suggestedFilename()).toBe('converted-images.zip');
    const reader = new ZipReader(new BlobReader(new Blob([await downloaded(archive)])), { useWebWorkers: false });
    const entries = await reader.getEntries(); expect(entries.map(e => e.filename)).toEqual(['landscape.png']);
    const entry = entries[0]; if (entry.directory) throw new Error('Unexpected directory');
    expect(Buffer.from(await entry.getData!(new Uint8ArrayWriter()))).toEqual(png.bytes); await reader.close();
    expect(guard.workers.filter(url => url.startsWith('worker:'))).toHaveLength(4);
    await expect.poll(guard.liveWorkers).toBe(0);
    expect(guard.requests.some(r => r.url.includes('heic-to'))).toBe(true);
    expect(guard.violations).toEqual([]); expect(guard.failures).toEqual([]); expect(errors).toEqual([]);
    expect(attempted.every(url => /^\/(?:$|assets\/[^/]+\.(?:js|css)$|index\.html$)/.test(url))).toBe(true);
    expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length }))).toEqual({ local: 0, session: 0, databases: 0, caches: 0, serviceWorkers: 0 });
  } finally { await guard.close(); }
});

for (const format of ['JPEG', 'PNG']) {
  test(`${format}: портрет, зеркало и основное изображение, а не первый кадр`, async ({ page }) => {
    await page.goto('/'); await page.getByRole('radio', { name: format, exact: true }).check();
    await add(page, ['portrait','mirror','primary-second']); await convert(page);
    await expect(page.locator('.file-row[data-state=done]')).toHaveCount(3);
    const portrait = await inspect(page,0); expect([portrait.width,portrait.height]).toEqual([96,160]);
    [blue,red,yellow,green].forEach((color,i) => closeColor(portrait.colors[i],color));
    const mirror = await inspect(page,1); expect([mirror.width,mirror.height]).toEqual([160,96]);
    [green,red,yellow,blue].forEach((color,i) => closeColor(mirror.colors[i],color));
    const primary = await inspect(page,2); expect([primary.width,primary.height]).toEqual([72,120]); closeColor(primary.colors[0],[30,180,70,255]);
  });
  test(`${format}: alpha и удаление исходных EXIF/GPS/XMP`, async ({ page }, testInfo) => {
    await page.goto('/'); await page.getByRole('radio', { name: format, exact: true }).check();
    await add(page,['alpha','portrait']); await convert(page);
    const alpha = await inspect(page,0);
    closeColor(alpha.colors[0], format === 'PNG' ? [0,0,0,0] : [255,255,255,255]);
    const output = await saveResult(page,1);
    // Fixture contains real Exif IFD with Artist/Make and GPS IFD; source assertion guards this scenario.
    const source = await readFile(fixture('portrait'));
    assertSourceGps(source);
    expect(source.includes(Buffer.from('Exif'))).toBe(true);
    expect(source.includes(Buffer.from('HEIC_TEST_AUTHOR_2026'))).toBe(true);
    expect(source.includes(Buffer.from('HEIC_TEST_XMP_2026'))).toBe(true);
    for (const marker of ['Exif\0\0','HEIC_TEST_AUTHOR_2026','HEIC_TEST_CAMERA','HEIC_TEST_XMP_2026','GPSLatitude','x:xmpmeta']) expect(output.bytes.includes(Buffer.from(marker))).toBe(false);
    if (format === 'JPEG') {
      // No APP1 segment: no original TIFF/Exif/GPS or XMP payload can survive there.
      expect(output.bytes.includes(Buffer.from([0xff,0xe1]))).toBe(false);
    } else {
      let offset = 8; const chunks: string[] = [];
      while (offset < output.bytes.length) { const length = output.bytes.readUInt32BE(offset); chunks.push(output.bytes.toString('ascii',offset+4,offset+8)); offset += 12 + length; }
      expect(chunks).not.toContain('eXIf'); expect(chunks).not.toContain('iTXt'); expect(chunks).not.toContain('tEXt');
    }
    await testInfo.attach('converted-' + output.name, { body: output.bytes, contentType: format === 'PNG' ? 'image/png' : 'image/jpeg' });
  });
}

test('частичный успех, русские и совпадающие имена, ZIP с точными данными', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Фотографии HEIC или HEIF').setInputFiles([
    { name: 'Снимок.HEIC', mimeType: '', buffer: await readFile(fixture('landscape')) },
    { name: 'broken.heic', mimeType: '', buffer: await readFile(fixture('broken')) },
    { name: 'Снимок.heic', mimeType: 'application/octet-stream', buffer: await readFile(fixture('portrait')) },
    { name: 'renamed.heic', mimeType: '', buffer: await readFile(fixture('renamed')) },
  ]);
  await convert(page);
  await expect(page.locator('.file-row[data-state=done]')).toHaveCount(2); await expect(page.locator('.file-row[data-state=error]')).toHaveCount(2);
  await expect(page.getByText('В ZIP войдут 2 из 4 файлов. Не обработано: 2.')).toBeVisible();
  const a = await saveResult(page,0), b = await saveResult(page,2);
  expect(a.name).toBe('Снимок.jpg'); expect(b.name).toBe('Снимок (2).jpg');
  const event = page.waitForEvent('download'); await page.getByRole('button',{ name: 'Скачать ZIP (2)' }).click();
  const archive = await event;
  const reader = new ZipReader(new BlobReader(new Blob([await downloaded(archive)])),{ useWebWorkers: false });
  const entries = await reader.getEntries(); expect(entries.map(e => e.filename)).toEqual([a.name,b.name]);
  for(let i=0;i<entries.length;i++) { const entry=entries[i]; if(entry.directory) throw new Error('Unexpected directory'); expect(Buffer.from(await entry.getData!(new Uint8ArrayWriter()))).toEqual([a.bytes,b.bytes][i]); }
  await reader.close();
  await page.getByRole('button',{name:'Повторить ошибки',exact:true}).click();
  await expect(page.getByRole('button',{name:'Выбрать файлы'})).toBeEnabled();
  await expect(page.locator('.file-row[data-state=done]')).toHaveCount(2);
});

test('качество JPEG действует функционально; старые результаты явно подписаны', async ({ page }) => {
  await page.goto('/'); await add(page,['noise']);
  await page.getByRole('slider').fill('10'); await convert(page); const low = await saveResult(page);
  await page.getByRole('slider').fill('100');
  await expect(page.getByText(/Создан с прежними параметрами/)).toBeVisible();
  await page.getByRole('button',{name:'Конвертировать всё заново'}).click();
  await expect(page.getByRole('button',{name:'Выбрать файлы'})).toBeEnabled(); const high = await saveResult(page);
  expect(low.bytes.equals(high.bytes)).toBe(false); expect(high.bytes.length).toBeGreaterThan(low.bytes.length);
  expect([(await inspect(page)).width,(await inspect(page)).height]).toEqual([256,192]);
});

test('отмена настоящего Worker, очистка и новая конвертация', async ({ page }) => {
  await page.goto('/'); await add(page,['noise','landscape']);
  await page.getByRole('button',{name:'Конвертировать (2)'}).click();
  await page.getByRole('button',{name:'Отменить',exact:true}).click();
  await expect(page.locator('.file-row[data-state=cancelled]')).not.toHaveCount(0);
  await page.getByRole('button',{name:/Повторить ошибки/}).click();
  await expect(page.getByRole('button',{name:'Выбрать файлы'})).toBeEnabled(); await expect(page.locator('.file-row[data-state=done]')).toHaveCount(2);
  await page.getByRole('button',{name:'Очистить список'}).click();
  await add(page,['landscape']); await convert(page); await expect(page.locator('.file-row[data-state=done]')).toHaveCount(1);
  await page.reload(); await expect(rows(page)).toHaveCount(0);
});

test('узкое окно и длинные имена не создают горизонтальный скролл', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await page.getByLabel('Фотографии HEIC или HEIF').setInputFiles({name:'Длинное русское имя фотографии '.repeat(7)+'.heic',mimeType:'',buffer:await readFile(fixture('landscape'))});
  await convert(page); await expect(page.locator('.file-row[data-state=done]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile.png'),fullPage:true});
});

test('адаптер в production Worker возвращает правильные MIME и сигнатуры', async ({ page }) => {
  await page.goto('/');
  const workerPath='/assets/'+(await readdir('dist/assets')).find(name=>name.startsWith('convert.worker-'))!;
  const contents=Array.from(await readFile(fixture('landscape')));
  for (const format of ['jpeg','png'] as const) {
    const response=await page.evaluate(async ({workerPath,format,contents}) => {
      const file=new File([Uint8Array.from(contents)],'landscape.heic');
      const worker=new Worker(workerPath,{type:'module'});
      return new Promise<{ mime: string; width: number; height: number; signature: number[] }>((resolve,reject)=>{
        const timer=setTimeout(()=>{ worker.terminate(); reject(new Error('Decoder timed out')); },15000);
        worker.onmessage=async event=>{
          if(event.data.phase==='ready') return;
          clearTimeout(timer); worker.terminate();
          if(event.data.phase==='error') return reject(new Error(event.data.message));
          const {blob,width,height}=event.data.result;
          resolve({mime:blob.type,width,height,signature:Array.from(new Uint8Array(await blob.slice(0,8).arrayBuffer()))});
        };
        worker.postMessage({runId:1,jobId:'mime-check',file,settings:{format,quality:90}});
      });
    },{workerPath,format,contents});
    expect(response.mime).toBe('image/'+format); expect([response.width,response.height]).toEqual([160,96]);
    expect(response.signature.slice(0,format==='jpeg'?3:8)).toEqual(format==='jpeg'?[255,216,255]:[137,80,78,71,13,10,26,10]);
  }
});
