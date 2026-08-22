@echo off
setlocal
chcp 65001 >nul

set "BUILD_SCRIPT=%~dp0build_windows.ps1"

if not exist "%BUILD_SCRIPT%" (
  echo ERROR: build_windows.ps1 was not found.
  goto :build_error
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" %*
if errorlevel 1 goto :build_error

echo.
echo Build completed successfully.
if not defined CLASSVIEW_BUILD_NO_PAUSE pause
exit /b 0

:build_error
echo.
echo ERROR: Could not build the ClassView administration tool.
if not defined CLASSVIEW_BUILD_NO_PAUSE pause
exit /b 1
