$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'build_firebase.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Firebaseのバンドルに失敗しました。' }
& (Join-Path $PSScriptRoot 'build_windows_setup.ps1')
