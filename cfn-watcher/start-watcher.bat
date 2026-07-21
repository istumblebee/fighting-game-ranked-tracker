@echo off
REM Double-click this file to start the CFN watcher (Windows). No command line needed.
cd /d "%~dp0"
title SF6 Ranked Lab - CFN watcher

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js isn't installed yet.
  echo Get the "LTS" installer from https://nodejs.org , run it, then double-click this file again.
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo First-time setup - installing, this takes a couple of minutes...
  call npm install || (echo Setup failed. & pause & exit /b)
  call npx playwright install chromium || (echo Browser download failed. & pause & exit /b)
)

echo.
echo Starting the watcher. A browser window will open - sign into Buckler's Boot Camp there the first time.
echo Leave this window open while you play, then hit "Sync from CFN now" in the tracker.
echo Close this window to stop.
echo.
node watch.js --serve
pause
