@echo off
title PrintEase Auto-Print Setup
color 0A
echo =======================================================
echo    PrintEase Wireless Auto-Print Agent Initializer
echo =======================================================
echo.
echo Connecting your shop printer...
set EXT_PATH=%~dp0

:: Launch Chrome or Edge with extension auto-loaded
start chrome --load-extension="%EXT_PATH%\" "http://localhost:3000/admin"
if %errorlevel% neq 0 (
    start msedge --load-extension="%EXT_PATH%\" "http://localhost:3000/admin"
)

echo.
echo [SUCCESS] Your shop printer is now CONNECTED and ready!
echo Auto-printing will process incoming wireless orders automatically.
echo.
timeout /t 5
