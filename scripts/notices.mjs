import { mkdir, readdir, writeFile, copyFile, cp } from 'node:fs/promises';
import path from 'node:path';

await mkdir('dist/licenses', { recursive: true });
await cp('licenses', 'dist/licenses', { recursive: true });
await copyFile('THIRD_PARTY_NOTICES.txt', 'dist/THIRD_PARTY_NOTICES.txt');
await copyFile('LICENSE', 'dist/LICENSE.txt');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paths.push(...await walk(p));
    else paths.push(p.slice('dist/'.length).split(path.sep).join('/'));
  }
  return paths;
}
await writeFile('dist/static-files.json', JSON.stringify(await walk('dist'), null, 2));
