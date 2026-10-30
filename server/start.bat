@echo off
cd /d "%~dp0"
title Taxi Queue Server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org , install it, then run this again.
  pause
  exit /b 1
)
:loop
node server.js
echo.
echo The server stopped. Restarting in 5 seconds. Close this window to stop it for good.
timeout /t 5 /nobreak >nul
goto loop
