const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major === 24 && minor >= 15)) {
  console.error('Нужен Node.js 24.15+ (ветка 24). Установлена версия ' + process.versions.node + '.');
  process.exit(1);
}
