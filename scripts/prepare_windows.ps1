$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'build_firebase.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Firebase bundle build failed.' }
& (Join-Path $PSScriptRoot 'build_windows_setup.ps1')
