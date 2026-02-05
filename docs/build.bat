@echo off
REM BSB Documentation Build Script (Windows)
REM Builds all documentation for BSB including:
REM - Vite-based documentation site
REM - TypeDoc API reference for Node.js

echo Building BSB Documentation...
echo.

REM Clean previous build
echo Cleaning previous build...
if exist dist rmdir /s /q dist

REM Build everything (Vite site + TypeDoc API reference)
REM This runs:
REM   1. vite build - builds the documentation site
REM   2. build-types:nodejs - generates TypeDoc API reference from ../nodejs/src
echo Building documentation site and API references...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo.
echo Build complete! Documentation ready in dist/
echo   - Site: dist\index.html
echo   - Node.js API: dist\languages\nodejs\types\index.html
