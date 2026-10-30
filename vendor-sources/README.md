# Исходники LGPL-компонентов

В поставку включены неизменённые исходники и сборочные скрипты upstream:

| Архив | Источник |
|---|---|
| heic-to-1.6.7.tar.gz | https://codeload.github.com/hoppergee/heic-to/tar.gz/refs/tags/v1.6.7 |
| libheif-1.23.7.tar.gz | https://codeload.github.com/strukturag/libheif/tar.gz/refs/tags/v1.23.7 |
| libde265-1.0.16.tar.gz | https://codeload.github.com/strukturag/libde265/tar.gz/refs/tags/v1.0.16 |

SHA-256 указан в SHA256SUMS относительно корня проекта.
Архив heic-to содержит JS-исходники, сгенерированный libheif с вариантом без
unsafe-eval, готовые ESM-файлы и esbuild.mjs. Декодер приложением не изменён.
В заголовке src/lib/libheif-without-unsafe-eval.js указаны libheif 1.23.7,
LIBDE265_VERSION=1.0.16 и USE_UNSAFE_EVAL=0.

Для модификации приложения: npm ci, правка src, npm run build.
Для замены декодера можно заменить интерфейс-совместимый
node_modules/heic-to/dist/csp/heic-to.js своей версией, затем выполнить npm run build.
Следующий npm ci восстановит lock-версию; сохраните свою модификацию отдельно.

Чтобы пересобрать JS-обёртку, распакуйте heic-to, отредактируйте src, установите
его dev-зависимости и выполните npm run build внутри распакованной папки.
Для пересборки нативного libheif в JS нужен Emscripten и инструменты C/C++;
это не требуется для установки/работы приложения. См. upstream README.md и
libheif/build-emscripten.sh. Параметры CSP-варианта:
LIBDE265_VERSION=1.0.16 USE_UNSAFE_EVAL=0 USE_WASM=0.
В upstream README heic-to описана замена llvm-nm для macOS; применяйте только
для собственной среды сборки. Это инструкции upstream, не требование установки.

MIT-лицензия приложения разрешает повторную сборку/компоновку с изменённой
библиотекой. Отладка и reverse engineering для таких модификаций разрешены.
При распространении сохраняйте лицензии, исходники и уведомления.
