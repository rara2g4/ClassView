@echo off
setlocal
chcp 65001 >nul

pushd "%~dp0\..\.." || goto :path_error
set "TOOL_ROOT=%CD%\tools\course-importer"
set "BUILD_PYTHON=%TOOL_ROOT%\.venv\Scripts\python.exe"

if not exist "%BUILD_PYTHON%" (
  python -m venv "%TOOL_ROOT%\.venv"
  if errorlevel 1 goto :build_error
)

"%BUILD_PYTHON%" -m pip install -r "%TOOL_ROOT%\requirements.txt" -r "%TOOL_ROOT%\requirements-build.txt"
if errorlevel 1 goto :build_error

"%BUILD_PYTHON%" -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --noconsole ^
  --name "ClassView管理ツール" ^
  --distpath "%TOOL_ROOT%\dist" ^
  --workpath "%TOOL_ROOT%\build" ^
  --specpath "%TOOL_ROOT%" ^
  --add-data "%TOOL_ROOT%\templates;templates" ^
  --add-data "%TOOL_ROOT%\static;static" ^
  "%TOOL_ROOT%\app.py"
if errorlevel 1 goto :build_error

echo.
echo Build completed:
echo %TOOL_ROOT%\dist\ClassView管理ツール.exe
echo.
echo Run install_windows_shortcut.bat once to create a desktop shortcut.
popd
pause
exit /b 0

:path_error
echo ERROR: Could not find the ClassView folder.
pause
exit /b 1

:build_error
echo ERROR: Could not build the ClassView administration tool.
popd
pause
exit /b 1
