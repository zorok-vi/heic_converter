@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js 24.15+ ^(ветка 24^) с https://nodejs.org.
  pause
  exit /b 1
)
node scripts\check-node.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\server.mjs %*
if errorlevel 1 (
  echo Ошибка запуска показана выше.
  pause
  exit /b 1
)
exit /b 0
