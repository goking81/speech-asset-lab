@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20.9 or later was not found. Install it and run this script again.
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm 11 or later was not found. Install it and run this script again.
  exit /b 1
)

if not exist "node_modules" (
  echo [1/5] Installing locked dependencies...
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

echo [2/5] Generating Prisma Client...
call pnpm prisma:generate
if errorlevel 1 goto :failed

echo [3/5] Initializing local SQLite and directories...
call pnpm db:setup
if errorlevel 1 goto :failed

echo [4/5] Building the local production version...
call pnpm build
if errorlevel 1 goto :failed

echo [5/5] Starting the local server and opening your browser...
node scripts\start-local-server.mjs
if errorlevel 1 goto :failed

echo.
echo The local app is ready. Run stop-local.bat to stop it.
exit /b 0

:failed
echo.
echo [ERROR] The local app did not start. Check the output above and README.md.
exit /b 1
