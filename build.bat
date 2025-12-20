@echo off
title Build Oman Swiss Army Tool

echo ==========================================
echo      Building Oman Swiss Army Tool
echo ==========================================
echo.

echo Cleaning up previous builds (optional)...
REM rd /s /q .next

echo Checking dependencies...
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies.
    pause
    exit /b %ERRORLEVEL%
)

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
echo      FINALIZING STANDALONE BUILD
echo ==========================================
echo.

echo Copying 'public' folder (Models and Assets)...
xcopy /E /I /Y public .next\standalone\public >nul

echo Copying 'bin' folder (OC Executable)...
xcopy /E /I /Y bin .next\standalone\bin >nul

echo Copying '.next/static' folder...
xcopy /E /I /Y .next\static .next\standalone\.next\static >nul

echo Copying launcher script...
copy /Y scripts\start_standalone.bat .next\standalone\start.bat >nul


echo.
echo ==========================================
echo            BUILD SUCCESSFUL ✅
echo ==========================================
echo.
echo You can now run the app in production mode with improved performance.
echo.

:ASK_RELEASE
set /p GIT_RELEASE="Apply to Git? (Create Release & Zip) (Y/N): "
if /i "%GIT_RELEASE%" NEQ "Y" goto ASK_START

echo.
echo ==========================================
echo      PREPARING RELEASE
echo ==========================================
echo.
echo Fetching version from package.json...
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set APP_VERSION=%%v
echo Detected Version: %APP_VERSION%

set ZIP_NAME=OmanSwissArmyTool-%APP_VERSION%-beta.zip

echo.
echo Zipping standalone build package...
if exist "%ZIP_NAME%" del "%ZIP_NAME%"
tar -a -c -f "%ZIP_NAME%" -C ".next\standalone" .

echo.
echo Creating GitHub Release v%APP_VERSION%...
call gh release create v%APP_VERSION% "%ZIP_NAME%" --title "v%APP_VERSION% Beta" --generate-notes --prerelease

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to create release. Check if 'gh' is installed and authenticated.
    echo         Also check if tag v%APP_VERSION% already exists.
    pause
) else (
    echo.
    echo Release published successfully! 🚀
)

:ASK_START
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
