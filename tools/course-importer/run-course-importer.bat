@echo off
setlocal

pushd "%~dp0\..\.." || goto :path_error

set "IMPORTER_PYTHON=%CD%\tools\course-importer\.venv\Scripts\python.exe"
set "IMPORTER_REQUIREMENTS=%CD%\tools\course-importer\requirements.txt"
set "IMPORTER_APP=%CD%\tools\course-importer\app.py"

if not exist "%IMPORTER_PYTHON%" (
  echo Setting up the local Python environment...
  python -m venv "%CD%\tools\course-importer\.venv"
  if errorlevel 1 goto :setup_error
)

"%IMPORTER_PYTHON%" -c "import flask, jsonschema, pypdf" >nul 2>&1
if errorlevel 1 (
  echo Installing required Python packages...
  "%IMPORTER_PYTHON%" -m pip install -r "%IMPORTER_REQUIREMENTS%"
  if errorlevel 1 goto :setup_error
)

echo Starting ClassView administration tool...
"%IMPORTER_PYTHON%" "%IMPORTER_APP%"
set "IMPORTER_EXIT=%ERRORLEVEL%"
popd
exit /b %IMPORTER_EXIT%

:path_error
echo ERROR: Could not find the ClassView repository directory.
pause
exit /b 1

:setup_error
echo ERROR: Could not prepare the Python environment.
popd
pause
exit /b 1
