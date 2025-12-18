@echo off
title Oman Swiss Army Tool
cd /d "%~dp0"

echo ==========================================
echo      Oman Swiss Army Tool (Portable)
echo ==========================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo         Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Start Application
echo [+] Starting Server on port 1998...
echo [+] Access App at: http://localhost:1998
echo.
echo Press Ctrl+C to stop the server.
echo.

:: Set Port to match Dev environment
set PORT=1998
set HOSTNAME=0.0.0.0

:: Open Browser automatically
timeout /t 3 >nul
start "" "http://localhost:1998"

:: Run Standalone Server
node server.js

pause
