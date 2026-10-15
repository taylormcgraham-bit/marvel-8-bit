@echo off
rem Windows: double-click this file to open the game. Keep the window open while playing.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ^>^> Node.js is not installed. Install the LTS version from https://nodejs.org then double-click Play.bat again.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node scripts\play.mjs
pause
