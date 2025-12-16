@echo off
rem Switch to UTF-8
chcp 65001 >nul
setlocal
title Oman Swiss Army Tool - Launcher

echo ===================================================
echo   Oman Swiss Army Tool - Launcher
echo ===================================================
echo.

:: ---------------------------------------------------
:: 1. CHECK NODE.JS
:: ---------------------------------------------------
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

:: ---------------------------------------------------
:: 2. CHECK DEPENDENCIES
:: ---------------------------------------------------
echo.
echo [+] Verify dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Standard npm install failed. Retrying with corporate proxy...
    call npm install --registry=https://nexus.apps.ocp.sm.co.id/repository/npm-proxy
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed. Check VPN/Internet.
        pause
        exit /b 1
    )
)
echo [OK] Dependencies installed.

:: ---------------------------------------------------
:: 3. CHECK EXTENSIONS (Optional)
:: ---------------------------------------------------
if not exist "bin\oc.exe" (
    echo.
    echo [WARNING] bin\oc.exe not found.
    echo           Fitur OpenShift mungkin tidak berjalan.
)

:: ---------------------------------------------------
:: 3.5 CHECK AI MODEL (SQL Review)
:: ---------------------------------------------------
echo.
set "MODEL_DIR=public\models\qwen25coder"
set "ONNX_FILE=%MODEL_DIR%\onnx\decoder_model_merged_quantized.onnx"

if exist "%ONNX_FILE%" goto :SKIP_DOWNLOAD_MODEL

echo [INFO] AI Model for 'SQL Review' feature is missing.
echo        Fitur ini membutuhkan file tambahan sekitar 450 MB.
echo.
set /p ASK_DOWNLOAD="Download Model Sekarang? (Y/N): "

if /i not "%ASK_DOWNLOAD%"=="Y" goto :SKIP_DOWNLOAD_MODEL

echo.
echo [+] Preparing directories...
if not exist "%MODEL_DIR%" mkdir "%MODEL_DIR%"
if not exist "%MODEL_DIR%\onnx" mkdir "%MODEL_DIR%\onnx"

echo [+] Downloading Config Files from Bantupedia...
curl -L "https://model.bantupedia.id/Qwen2.5-Coder-0.5B-Instruct/config.json" -o "%MODEL_DIR%\config.json"
curl -L "https://model.bantupedia.id/Qwen2.5-Coder-0.5B-Instruct/special_tokens_map.json" -o "%MODEL_DIR%\special_tokens_map.json"
curl -L "https://model.bantupedia.id/Qwen2.5-Coder-0.5B-Instruct/tokenizer.json" -o "%MODEL_DIR%\tokenizer.json"
curl -L "https://model.bantupedia.id/Qwen2.5-Coder-0.5B-Instruct/tokenizer_config.json" -o "%MODEL_DIR%\tokenizer_config.json"

echo [+] Downloading Model File (400MB+)...
curl -L "https://model.bantupedia.id/Qwen2.5-Coder-0.5B-Instruct/onnx/model_quantized.onnx" -o "%MODEL_DIR%\onnx\decoder_model_merged_quantized.onnx"
echo [OK] Download Complete.

:SKIP_DOWNLOAD_MODEL
echo [OK] AI Setup Check Done.

:: ---------------------------------------------------
:: 4. START APP
:: ---------------------------------------------------
echo.
echo [+] Starting Application...
echo     Opening http://localhost:1998 ...

timeout /t 3 >nul
start "" "http://localhost:1998"

call npm run dev

echo.
echo [INFO] Server stopped.
pause
