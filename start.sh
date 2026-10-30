#!/bin/sh
set -u
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
cd "$SCRIPT_DIR" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js не найден. Установите Node.js 24.15+ (ветка 24) с https://nodejs.org.\n' >&2
  exit 1
fi
node scripts/check-node.cjs || exit 1
exec node scripts/server.mjs "$@"
