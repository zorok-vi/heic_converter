@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js 24.15+ ^(ветка 24^) с https://nodejs.org.
  goto :fail
)
node scripts\check-node.cjs
if errorlevel 1 goto :fail
where npm >nul 2>nul
if errorlevel 1 (
  echo npm не найден. Установите Node.js вместе с npm.
  goto :fail
)
echo Первоначальная подготовка: нужен интернет для npm ci.
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
echo Готово. Для повседневного запуска откройте start.bat.
pause
exit /b 0
:fail
echo Подготовка прервана. Ошибка показана выше. Исправьте её и повторите setup.bat.
pause
exit /b 1
