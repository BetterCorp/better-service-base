@echo off
REM BSB Documentation Build Script (Windows)
REM Builds all documentation for BSB including:
REM - Vite-based documentation site

echo Building BSB Documentation...
echo.

REM Clean previous build
echo Cleaning previous build...
if exist dist rmdir /s /q dist

REM Build site only (API reference is hosted separately on types.bsbcode.dev)
echo Building documentation site...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo.
echo Build complete! Documentation ready in dist/
echo   - Site: dist\index.html
echo   - Node.js API: https://types.bsbcode.dev/nodejs/
