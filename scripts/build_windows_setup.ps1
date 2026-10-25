param([switch]$Bootstrap)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $taskRoot 'src-tauri\windows'
$outputRoot = Join-Path $sourceRoot 'bin'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'Run this script in an MSVC Developer PowerShell environment.' }
$config = Get-Content -LiteralPath (Join-Path $taskRoot 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$versionHeader = '#define COVO_SETUP_VERSION L"' + $config.version + '"'
$iconFile = Join-Path $taskRoot 'src-tauri\icons\icon.ico'
if (-not (Test-Path -LiteralPath $iconFile)) { throw 'Covo setup icon is missing.' }
$resourceLines = @('201 ICON "' + $iconFile.Replace('\','\\') + '"')
$definitions = @('/DCOVO_MAINTENANCE')
$executableName = 'CovoMaintenance.exe'
if ($Bootstrap) {
  $engines = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'src-tauri\target\release\bundle\nsis') -Filter '*-setup.exe')
  if ($engines.Count -ne 1) { throw 'Expected exactly one NSIS setup engine. Check the build artifacts.' }
  $engine = $engines[0].FullName
  $digest = (Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash
  $bytes = for ($index = 0; $index -lt 64; $index += 2) { '0x' + $digest.Substring($index, 2) }
  $versionHeader += "`n#define COVO_ENGINE_SHA256 " + ($bytes -join ',')
  $resourceLines += '101 RCDATA "' + $engine.Replace('\','\\') + '"'
  $definitions = @()
  $executableName = 'CovoSetup.exe'
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'branding.rc'), ($resourceLines -join "`r`n"))
& rc.exe /nologo /fo (Join-Path $outputRoot 'branding.res') (Join-Path $outputRoot 'branding.rc')
if ($LASTEXITCODE -ne 0) { throw 'Covo branding resource compilation failed.' }
$resourceArgs = @((Join-Path $outputRoot 'branding.res'))
[IO.File]::WriteAllText((Join-Path $outputRoot 'setup_version.h'), $versionHeader)
& cl.exe /nologo /std:c++17 /EHsc /utf-8 /O2 /MT /W4 @definitions /I $outputRoot (Join-Path $sourceRoot 'setup.cpp') @resourceArgs /Fo"$outputRoot\setup.obj" /Fe"$outputRoot\$executableName" /link /SUBSYSTEM:WINDOWS /DYNAMICBASE /NXCOMPAT /MANIFEST:EMBED /MANIFESTUAC:"level='asInvoker' uiAccess='false'"
if ($LASTEXITCODE -ne 0) { throw 'Covo setup compilation failed.' }
