@echo off
setlocal
chcp 65001 >nul

set "TOOL_ROOT=%~dp0"
set "TOOL_EXE=%TOOL_ROOT%dist\ClassView管理ツール.exe"

if not exist "%TOOL_EXE%" (
  echo ClassView administration tool has not been built yet.
  echo Run build_windows.bat first.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%TOOL_ROOT%create_windows_shortcut.ps1" -ExecutablePath "%TOOL_EXE%"
if errorlevel 1 (
  echo Could not create the desktop shortcut.
  pause
  exit /b 1
)

echo Desktop shortcut created.
pause
exit /b 0
