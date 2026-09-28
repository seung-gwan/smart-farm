@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  pause
  exit /b 1
)

echo Starting Smart Farm Codex Bridge...
echo Keep this window open while using AI Crop Check.
if not defined SMART_FARM_OPEN_BROWSER set SMART_FARM_OPEN_BROWSER=1
node local-codex-bridge.js

if errorlevel 1 pause
