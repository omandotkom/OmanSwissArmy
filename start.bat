@echo off
rem Switch to UTF-8 to prevent crash on special characters
chcp 65001 >nul
setlocal
title Oman Swiss Army Tool - Launcher

echo ===================================================
echo   Oman Swiss Army Tool - Launcher
echo ===================================================
echo.

:: 1. Check Node.js
echo [+] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not found!
    echo         Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js is ready.

:: 2. Check node_modules
if exist "node_modules" goto :SKIP_INSTALL

echo.
echo [+] First run detected. Installing dependencies...
echo     (This may take a few minutes)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed.
    echo         Please check your internet connection.
    echo.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

:SKIP_INSTALL
echo [OK] Dependencies ready.

:: 3. Check oc.exe (Warning Only)
if exist "bin\oc.exe" (
    echo [OK] OpenShift CLI found.
) else (
    echo.
    echo [WARNING] bin\oc.exe not found.
    echo           Simpan oc.exe di folder bin untuk fitur OpenShift.
    echo.
)

:: 4. Start App
echo.
echo [+] Starting Application...
echo     Opening http://localhost:1998 ...

:: Start browser slightly later to allow server to boot
timeout /t 3 >nul
start "" "http://localhost:1998"

:: Run Server
call npm run dev

:: Pause IF server crashes or stops
echo.
echo [INFO] Server stopped.
pause
