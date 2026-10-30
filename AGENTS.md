# Локальный HEIC-конвертер

React + strict TypeScript + Vite. UI и фотографии в браузере; обработка в Worker.
Сервер scripts/server.mjs использует только Node.js и раздаёт разрешённые файлы dist
на 127.0.0.1. Не добавлять upload API, внешние ресурсы, телеметрию, хранилища и Service Worker.
Не ослаблять CSP до unsafe-eval. Декодер изолирован в conversion/adapter.ts.
Очередь обрабатывает один файл за раз; завершение Worker обязательно при отмене/тайм-ауте.

Команды: npm ci; npm run dev; npm run build; npm start; npm start -- --port 8081.
Проверки: npm run typecheck; npm run lint; npm test; npm run test:e2e.
E2E использует production dist и штатный сервер. CHROMIUM_PATH — необязательный
путь к установленному Chromium для тестов, иначе используется Chromium Playwright.
После изменений декодера проверять реальные HEIC, CSP и сеть Worker в чистом профиле.
Не объявлять Windows/macOS или предельные размеры проверенными без фактических испытаний.
