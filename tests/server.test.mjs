import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, cp, chmod } from 'node:fs/promises';
import { once } from 'node:events';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { createStaticServer, CSP, parseArgs } from '../scripts/server.mjs';

const project = path.resolve('.');
async function temp() { await mkdir('work', { recursive: true }); return mkdtemp(path.resolve('work/server-')); }
function get(port, url = '/', headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: url, headers, method }, res => {
      const parts = []; res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    });
    req.on('error', reject); req.end();
  });
}
async function waitOutput(child, pattern) {
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: ' + output)), 10000);
    const listen = data => { output += data; if (pattern.test(output)) { clearTimeout(timer); resolve(output); } };
    child.stdout.on('data', listen); child.stderr.on('data', listen);
    child.once('exit', code => { if (!pattern.test(output)) { clearTimeout(timer); reject(new Error(`Exit ${code}: ${output}`)); } });
  });
}
async function exited(child) { const [code, signal] = await once(child, 'exit'); return { code, signal }; }
async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: project, ...options });
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  const result = await exited(child); return { ...result, output };
}

test('аргументы не позволяют менять host и проверяют порт', () => {
  assert.deepEqual(parseArgs([]), { port: 8080, open: true });
  assert.deepEqual(parseArgs(['--port', '8081', '--no-open']), { port: 8081, open: false });
  for (const args of [['--port', '0'], ['--port', '65536'], ['--port', 'abc'], ['--port'], ['--host', '0.0.0.0'], ['--port', '8081;whoami']]) assert.throws(() => parseArgs(args));
});

test('сервер: loopback, Host, методы, MIME, traversal и symlink', async context => {
  const dir = await temp();
  try {
    const dist = path.join(dir, 'dist'); await mkdir(dist);
    await writeFile(path.join(dist, 'index.html'), '<html>local</html>');
    await writeFile(path.join(dist, 'worker.js'), 'postMessage(1)');
    await writeFile(path.join(dist, 'module.wasm'), 'wasm');
    await writeFile(path.join(dist, 'private.txt'), 'unlisted');
    await writeFile(path.join(dir, 'secret.txt'), 'SECRET');
    try { await symlink(path.join(dir, 'secret.txt'), path.join(dist, 'link.txt')); }
    catch (error) {
      if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
      context.diagnostic('Symlink-проверка не выполнена: Windows не разрешила создать ссылку. Остальные проверки сервера продолжаются.');
    }
    await writeFile(path.join(dist, 'static-files.json'), JSON.stringify(['index.html', 'worker.js', 'module.wasm', 'link.txt']));
    const server = await createStaticServer(dist, 0);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const address = server.address(); const port = address.port;
      assert.equal(address.address, '127.0.0.1');
      const response = await get(port);
      assert.equal(response.code, 200); assert.equal(response.headers['content-security-policy'], CSP);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      assert.equal((await get(port, '/', { Host: 'evil.test' })).code, 403);
      assert.equal((await get(port, '/', { Host: `localhost:${port}` })).code, 403);
      assert.equal((await get(port, '/', {}, 'POST')).code, 405);
      assert.equal((await get(port, '/', {}, 'HEAD')).body, '');
      assert.match((await get(port, '/worker.js')).headers['content-type'], /^text\/javascript/);
      assert.equal((await get(port, '/module.wasm')).headers['content-type'], 'application/wasm');
      for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/%5c..%5csecret.txt', '/link.txt', '/node_modules/react/index.js', '/private.txt', '/.env', '/assets/missing.wasm', '/%252e%252e/secret.txt', '/source.ts']) {
        const result = await get(port, url); assert.notEqual(result.code, 200, url); assert.doesNotMatch(result.body, /SECRET|unlisted/);
      }
      assert.equal((await get(port, '/%zz')).code, 400);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('проверка версии Node выдаёт понятную ошибку', async () => {
  const script = await readFile('scripts/check-node.cjs', 'utf8');
  for (const version of ['18.20.0', '20.19.0', '22.22.2', '23.0.0', '24.14.9', '25.0.0']) {
    let status = 0, output = '';
    vm.runInNewContext(script, { process: { versions: { node: version }, exit: code => status = code }, console: { error: message => output = message } });
    assert.equal(status, 1); assert.match(output, /Нужен Node.js/);
  }
  for (const version of ['24.15.0', '24.19.0']) {
    vm.runInNewContext(script, { process: { versions: { node: version }, exit: () => assert.fail('supported Node rejected') }, console });
  }
});

test('запуск без node_modules из пути с пробелами/кириллицей, занятый порт и SIGINT', { skip: process.platform === 'win32' ? 'Этот сценарий проверяет Unix shell; Windows-скрипты требуют отдельной Windows-приёмки.' : false }, async () => {
  const dir = await temp(); const install = path.join(dir, 'Мои фотографии с пробелами');
  let child;
  try {
    await mkdir(install);
    for (const item of ['dist', 'scripts', 'start.sh', 'start.command', 'package.json']) await cp(item, path.join(install, item), { recursive: true });
    await chmod(path.join(install, 'start.sh'), 0o755);
    const occupied = await createStaticServer(path.join(install, 'dist'), 0);
    occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening'); const port = occupied.address().port;
    try {
      const result = await run(process.execPath, [path.join(install, 'scripts/server.mjs'), '--port', String(port)]);
      assert.equal(result.code, 1); assert.match(result.output, /занят/);
      assert.equal((await get(port)).code, 200);
    } finally { await new Promise(r => occupied.close(r)); }
    for (let repeat = 0; repeat < 2; repeat++) {
      child = spawn('/bin/sh', [path.join(install, 'start.sh'), '--port', String(port), '--no-open'], { cwd: '/tmp' });
      await waitOutput(child, /Остановка: Ctrl\+C/);
      assert.equal((await get(port)).code, 200);
      const exit = exited(child); child.kill('SIGINT'); await exit; child = undefined;
      await assert.rejects(get(port));
    }
  } finally { child?.kill('SIGTERM'); await rm(dir, { recursive: true, force: true }); }
});

test('отсутствие dist, Node.js и npm: объяснение без скрытой установки', { skip: process.platform === 'win32' ? 'Проверка отсутствия PATH-команд в Unix shell.' : false }, async () => {
  const dir = await temp();
  try {
    await cp('scripts', path.join(dir, 'scripts'), { recursive: true });
    const missing = await run(process.execPath, [path.join(dir, 'scripts/server.mjs'), '--no-open']);
    assert.equal(missing.code, 1); assert.match(missing.output, /dist отсутствует/);
    const bin = path.join(dir, 'bin'); await mkdir(bin); await symlink('/usr/bin/dirname', path.join(bin, 'dirname'));
    const env = { ...process.env, PATH: bin };
    const noNode = await run('/bin/sh', ['start.sh'], { env });
    assert.equal(noNode.code, 1); assert.match(noNode.output, /Node.js не найден/);
    await symlink(process.execPath, path.join(bin, 'node'));
    const noNpm = await run('/bin/sh', ['setup.sh'], { env });
    assert.equal(noNpm.code, 1); assert.match(noNpm.output, /npm не найден/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
