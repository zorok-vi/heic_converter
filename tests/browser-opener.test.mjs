import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { createStaticServer } from '../scripts/server.mjs';

test('ошибка открытия браузера не останавливает сервер; процесс открытия завершается при SIGINT', { skip: process.platform !== 'linux' ? 'Проверка xdg-open требует Linux; системный браузер на этой ОС не запускается тестом.' : false }, async () => {
  await mkdir('work', { recursive: true });
  const dir = await mkdtemp(path.resolve('work/opener-'));
  const stub = path.join(dir, 'xdg-open');
  const probe = path.join(dir, 'opener.pid');
  let child;
  try {
    const reserve = await createStaticServer(path.resolve('dist'), 0);
    reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const port = reserve.address().port; await new Promise(r => reserve.close(r));
    for (const long of [false, true]) {
      await writeFile(stub, long ? '#!/bin/sh\nprintf "%s\\n" "$$" > "$HEIC_OPEN_PROBE"\nexec /bin/sleep 300\n' : '#!/bin/sh\nexit 1\n');
      await chmod(stub, 0o755);
      child = spawn(process.execPath, ['scripts/server.mjs', '--port', String(port)], { env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, HEIC_OPEN_PROBE: probe } });
      let output = '';
      child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
      let opener;
      for (let tries = 0; tries < 100; tries++) {
        if (long) { try { opener = Number(await readFile(probe, 'utf8')); } catch { /* not created yet */ } }
        if (long ? opener : output.includes('Откройте адрес выше вручную')) break;
        await new Promise(r => setTimeout(r, 25));
      }
      assert.match(output, new RegExp('http://127.0.0.1:' + port));
      if (long) assert.ok(opener); else assert.match(output, /Откройте адрес выше вручную/);
      assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200);
      const exit = once(child, 'exit'); child.kill('SIGINT'); await exit; child = undefined;
      await assert.rejects(fetch(`http://127.0.0.1:${port}`));
      if (opener) assert.throws(() => process.kill(opener, 0), { code: 'ESRCH' });
    }
  } finally { child?.kill('SIGTERM'); await rm(dir, { recursive: true, force: true }); }
});
