[CmdletBinding()]
param(
    [switch]$RunTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'This build script must be run on Windows.'
}

$toolRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $toolRoot '..\..'))
$venvRoot = Join-Path $toolRoot '.venv'
$buildPython = Join-Path $venvRoot 'Scripts\python.exe'
$requirements = Join-Path $toolRoot 'requirements.txt'
$buildRequirements = Join-Path $toolRoot 'requirements-build.txt'
$entryPoint = Join-Path $toolRoot 'app.py'
$templatesRoot = Join-Path $toolRoot 'templates'
$staticRoot = Join-Path $toolRoot 'static'
$distRoot = Join-Path $toolRoot 'dist'
$workRoot = Join-Path $toolRoot 'build'
$testsRoot = Join-Path $toolRoot 'tests'
$executableName = 'ClassView' + [char]0x7BA1 + [char]0x7406 + [char]0x30C4 + [char]0x30FC + [char]0x30EB
$executablePath = Join-Path $distRoot ($executableName + '.exe')

foreach ($requiredPath in @($requirements, $buildRequirements, $entryPoint, $templatesRoot, $staticRoot)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required build input was not found: $requiredPath"
    }
}

if (-not (Test-Path -LiteralPath $buildPython)) {
    Write-Host 'Creating the isolated build environment...'
    $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($null -ne $pyLauncher) {
        & $pyLauncher.Source -3 -m venv $venvRoot
    }
    else {
        $python = Get-Command 'python.exe' -ErrorAction SilentlyContinue
        if ($null -eq $python) {
            throw 'Python 3 was not found. Install Python 3.9 or newer, then run this script again.'
        }
        & $python.Source -m venv $venvRoot
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $buildPython)) {
        throw 'Could not create the isolated build environment.'
    }
}

& $buildPython -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw 'ClassView requires Python 3.9 or newer.'
}

Write-Host 'Installing the runtime and build dependencies...'
& $buildPython -m pip install --disable-pip-version-check --requirement $requirements --requirement $buildRequirements
if ($LASTEXITCODE -ne 0) {
    throw 'Dependency installation failed.'
}

& $buildPython -c "import flask, jsonschema, openpyxl, pypdf, PyInstaller"
if ($LASTEXITCODE -ne 0) {
    throw 'One or more required Python packages cannot be imported.'
}

if ($RunTests) {
    Write-Host 'Running the Python test suite before packaging...'
    & $buildPython -m unittest discover -s $testsRoot -p 'test_*.py'
    if ($LASTEXITCODE -ne 0) {
        throw 'Tests failed. The executable was not built.'
    }
}

Write-Host 'Building the Windows executable...'
$pyInstallerArguments = @(
    '-m', 'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onefile',
    '--noconsole',
    '--name', $executableName,
    '--distpath', $distRoot,
    '--workpath', $workRoot,
    '--specpath', $toolRoot,
    '--add-data', ($templatesRoot + ';templates'),
    '--add-data', ($staticRoot + ';static'),
    '--paths', $toolRoot,
    $entryPoint
)
& $buildPython @pyInstallerArguments
if ($LASTEXITCODE -ne 0) {
    throw 'PyInstaller failed.'
}

if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "PyInstaller finished without creating the expected executable: $executablePath"
}

$pyInstallerVersion = (& $buildPython -m PyInstaller --version).Trim()
$artifact = Get-Item -LiteralPath $executablePath
$hash = Get-FileHash -LiteralPath $executablePath -Algorithm SHA256

Write-Host ''
Write-Host "PyInstaller: $pyInstallerVersion"
Write-Host "Repository:  $repoRoot"
Write-Host "Executable:  $($artifact.FullName)"
Write-Host "Size:        $($artifact.Length) bytes"
Write-Host "SHA256:      $($hash.Hash)"
Write-Host ''
Write-Host 'Use install_windows_shortcut.bat to create the staff desktop shortcut.'
