@echo off
title Build Oman Swiss Army Tool

echo ==========================================
echo      Building Oman Swiss Army Tool
echo ==========================================
echo.

echo Cleaning up previous builds (optional)...
REM rd /s /q .next

echo Running build process...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ==========================================
    echo            BUILD FAILED ❌
    echo ==========================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ==========================================
echo            BUILD SUCCESSFUL ✅
echo ==========================================
echo.
echo You can now run the app in production mode with improved performance.
echo.

set /p START_APP="Do you want to start the application now? (Y/N): "
if /i "%START_APP%"=="Y" (
    echo Starting application...
    npm run start
) else (
    echo.
    echo To start manually later, use: npm run start
    pause
)
