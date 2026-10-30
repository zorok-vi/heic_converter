#!/bin/sh
set -u
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
cd "$SCRIPT_DIR" || exit 1
fail() {
  printf '\nОшибка: %s\n' "$1" >&2
  if [ -t 0 ]; then printf 'Нажмите Enter, чтобы закрыть… '; read -r answer; fi
  exit 1
}
command -v node >/dev/null 2>&1 || fail 'Установите Node.js 24.15+ (ветка 24) с https://nodejs.org, затем повторите setup.'
node scripts/check-node.cjs || fail 'Неподдерживаемая версия Node.js.'
command -v npm >/dev/null 2>&1 || fail 'npm не найден. Установите Node.js вместе с npm.'
printf 'Первоначальная подготовка: нужен интернет для npm ci.\n'
npm ci --no-audit --no-fund || fail 'Не удалось установить зависимости. Проверьте подключение к интернету и повторите setup.'
npm run build || fail 'Не удалось собрать приложение. Сообщение об ошибке показано выше.'
printf '\nГотово. Повседневный запуск: ./start.sh (macOS: start.command).\n'
