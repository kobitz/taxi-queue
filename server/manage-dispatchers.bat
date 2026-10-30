@echo off
cd /d "%~dp0"
title Taxi Queue - Dispatcher accounts
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org , install it, then run this again.
  pause
  exit /b 1
)
:menu
echo.
echo  Dispatcher accounts
echo  -------------------
echo   1  Add a dispatcher
echo   2  Change a password
echo   3  Remove a dispatcher
echo   4  List dispatchers
echo   5  Quit
echo.
set choice=
set /p choice=Choose 1-5: 
if "%choice%"=="1" goto add
if "%choice%"=="2" goto passwd
if "%choice%"=="3" goto remove
if "%choice%"=="4" goto list
if "%choice%"=="5" exit /b 0
goto menu

:add
set name=
set /p name=Name for the new dispatcher (letters and numbers, no spaces): 
node users.js add %name%
goto menu

:passwd
set name=
set /p name=Which dispatcher? 
node users.js passwd %name%
goto menu

:remove
set name=
set /p name=Which dispatcher? 
node users.js remove %name%
goto menu

:list
node users.js list
goto menu
