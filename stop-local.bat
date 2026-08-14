@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found, so this script cannot safely inspect the local server record.
  exit /b 1
)

node scripts\stop-local-server.mjs
if errorlevel 1 (
  echo [ERROR] The local server was not stopped. No other Node.js process was affected.
  exit /b 1
)

exit /b 0
