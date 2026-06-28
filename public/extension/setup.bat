@echo off
title PrintEase Auto-Print Extension Installer
echo ===================================================
echo   PrintEase 1-Click Auto-Print Extension Setup
echo ===================================================
echo.
echo Activating PrintEase Chrome Extension...
set EXT_PATH=%~dp0

:: Try launching Chrome with loaded extension
start chrome --load-extension="%EXT_PATH%\" "http://localhost:3000/admin"

if %errorlevel% neq 0 (
    :: Fallback to Microsoft Edge if Chrome is not default
    start msedge --load-extension="%EXT_PATH%\" "http://localhost:3000/admin"
)

echo.
echo [SUCCESS] PrintEase Auto-Print Agent is now active!
echo Keep your browser running to receive wireless print jobs.
echo.
pause
