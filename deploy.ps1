# Covo Deploy Script
# Usage: .\deploy.ps1       (interactive confirm)
#        .\deploy.ps1 -y    (skip confirm)
#        npm run deploy      (deploy update)

param(
    [switch]$y
)

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host '  Covo Deploy Script' -ForegroundColor Cyan
Write-Host '====================================' -ForegroundColor Cyan
Write-Host ''

$versionJsonPath = Join-Path $PSScriptRoot 'public\version.json'
if (-not (Test-Path $versionJsonPath)) {
    Write-Host 'ERROR: public/version.json not found' -ForegroundColor Red
    exit 1
}

$versionData    = [System.IO.File]::ReadAllText($versionJsonPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$currentVersion = $versionData.version
Write-Host "Current version: $currentVersion" -ForegroundColor Yellow

$versionParts = $currentVersion.Split('.')
if ($versionParts.Length -ne 3) {
    Write-Host 'ERROR: Invalid version format (expected x.y.z)' -ForegroundColor Red
    exit 1
}

$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2] + 1
$newVersion = "$major.$minor.$patch"
$tagName    = "v$newVersion"

Write-Host "New version : $newVersion" -ForegroundColor Green
Write-Host "Tag name    : $tagName"    -ForegroundColor Green
Write-Host ''

if (-not $y) {
    Write-Host "Deploy v${newVersion}? (y/n): " -ForegroundColor White -NoNewline
    try {
        $confirm = [Console]::ReadLine()
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host 'Deploy cancelled.' -ForegroundColor Yellow
            exit 0
        }
    } catch {
        Write-Host 'Deploy cancelled. (Non-interactive mode requires -y)' -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Deploying v$newVersion ..." -ForegroundColor Green
Write-Host ''

# [0/6] Tailwind CSS
Write-Host '[0/6] Building Tailwind CSS...' -ForegroundColor Green
# NOTE: Tailwind CLI (tailwindcss.cmd) は index.html (456KB) スキャン時に Zone Allocation OOM でクラッシュするため
#       PostCSS を直接呼び出す scripts/build_tailwind.mjs を使用する。
#       クラスが追加された場合: node scripts/build_tailwind.mjs --regen
& "C:\Program Files\nodejs\node.exe" scripts\build_tailwind.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: Tailwind CSS build failed!' -ForegroundColor Red
    exit 1
}

# [1/6] version.json + tauri.conf.json + index.html
$versionData.version = $newVersion
# Preserve compatibility floors and other release policy fields.
$vjContent = ($versionData | ConvertTo-Json -Depth 20) + "`n"
[System.IO.File]::WriteAllText($versionJsonPath, $vjContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[1/6] Updated version.json -> $newVersion" -ForegroundColor Green

$indexHtmlPath = Join-Path $PSScriptRoot 'public\index.html'
if (Test-Path $indexHtmlPath) {
    $htmlRaw = [System.IO.File]::ReadAllText($indexHtmlPath, [System.Text.Encoding]::UTF8)
    $htmlPatched = $htmlRaw -replace '(\.js|\.css)\?v=[0-9.]+', ('$1?v=' + $newVersion)
    [System.IO.File]::WriteAllText($indexHtmlPath, $htmlPatched, [System.Text.UTF8Encoding]::new($false))
    Write-Host "       Synced index.html cache busters -> $newVersion" -ForegroundColor Green
}

$mainJsPath = Join-Path $PSScriptRoot 'public\js\main.js'
if (Test-Path $mainJsPath) {
    $mainRaw = [System.IO.File]::ReadAllText($mainJsPath, [System.Text.Encoding]::UTF8)
    $mainPatched = $mainRaw -replace '(\.js)\?v=[0-9.]+', ('$1?v=' + $newVersion)
    [System.IO.File]::WriteAllText($mainJsPath, $mainPatched, [System.Text.UTF8Encoding]::new($false))
    Write-Host "       Synced main.js internal import cache busters -> $newVersion" -ForegroundColor Green
}

$tauriConfPath = Join-Path $PSScriptRoot 'src-tauri\tauri.conf.json'
if (Test-Path $tauriConfPath) {
    $raw     = [System.IO.File]::ReadAllText($tauriConfPath, [System.Text.Encoding]::UTF8)
    $patched = $raw -replace '"version":\s*"[^"]+"', ('"version": "' + $newVersion + '"')
    [System.IO.File]::WriteAllText($tauriConfPath, $patched, [System.Text.UTF8Encoding]::new($false))
    $verify  = [System.IO.File]::ReadAllText($tauriConfPath, [System.Text.Encoding]::UTF8)
    if ($verify -notlike ('*"version": "' + $newVersion + '"*')) {
        Write-Host 'ERROR: tauri.conf.json sync failed' -ForegroundColor Red
        exit 1
    }
    Write-Host "       Synced tauri.conf.json -> $newVersion" -ForegroundColor Green
} else {
    Write-Host 'WARNING: tauri.conf.json not found, skipping.' -ForegroundColor Yellow
}

Write-Host 'Local version files prepared. Production has NOT been deployed.' -ForegroundColor Yellow

# Generate the Repomix snapshot before the release commit.
Write-Host '------------------------------------' -ForegroundColor DarkCyan
Write-Host '  Running Repomix...'                 -ForegroundColor Cyan
Write-Host '------------------------------------' -ForegroundColor DarkCyan
try {
    npx --yes repomix
    Write-Host 'Repomix completed successfully.' -ForegroundColor Green
} catch {
    Write-Host ("Repomix execution skipped or warning: " + $_.Exception.Message) -ForegroundColor Yellow
}
Write-Host ''

# [2/6] git commit
Write-Host '[2/6] Committing changes...' -ForegroundColor Green
git add -A
if ($LASTEXITCODE -ne 0) { throw 'Git staging failed.' }
git commit -m "Release v$newVersion"
if ($LASTEXITCODE -ne 0) { throw 'Git commit failed; production deployment was stopped.' }

# [3/6] git tag
Write-Host "[3/6] Creating tag $tagName ..." -ForegroundColor Green
git tag $tagName
if ($LASTEXITCODE -ne 0) { throw 'Git tag failed; production deployment was stopped.' }


# [4/6] Push the exact release commit, then monitor all three required jobs.
Write-Host '[4/6] Pushing branch and release tag to GitHub...' -ForegroundColor Green
$releaseCommit = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the release commit.' }
$releaseBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or -not $releaseBranch) { throw 'Deploy requires a checked-out branch.' }
if ($releaseBranch -notmatch '^(main|master|codex/.+)$') { throw 'This branch does not trigger the required validation workflow.' }
git push origin HEAD --tags
if ($LASTEXITCODE -ne 0) { throw 'Git push failed; production deployment was stopped.' }

Write-Host '[5/6] Waiting for web-and-rules, native and release...' -ForegroundColor Cyan
. (Join-Path $PSScriptRoot 'scripts\release_monitor.ps1')
$repo = 'qwertyuiop1229/Covo'
$githubToken = $env:GITHUB_TOKEN
if (-not $githubToken) { $githubToken = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN', 'User') }
if (-not $githubToken) { $githubToken = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN', 'Machine') }
if (-not $githubToken -and (Get-Command gh -ErrorAction SilentlyContinue)) {
    # Reuse an existing GitHub CLI login without prompting or logging credentials.
    try {
        $cliToken = & gh auth token --hostname github.com 2>$null
        if ($LASTEXITCODE -eq 0 -and $cliToken) { $githubToken = ([string]$cliToken).Trim() }
    } catch { $cliToken = $null }
}
Wait-CovoReleaseChecks -Repo $repo -Commit $releaseCommit -Tag $tagName -Branch $releaseBranch -Token $githubToken

# Publish the compatible Windows installer BEFORE withdrawing the old protocol.
$publishedRelease = Invoke-CovoGitHubApi $repo ('/releases/tags/' + $tagName) $githubToken
Assert-CovoPublishedRelease -Release $publishedRelease -Tag $tagName

# CI verified this commit; do not deploy edits made while waiting for the build.
$currentHead = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $currentHead -ne $releaseCommit) { throw 'HEAD changed during verification; production deployment was stopped.' }
$remainingChanges = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $remainingChanges) { throw 'Working tree changed during verification; production deployment was stopped.' }

Write-Host '[6/6] Deploying Firebase rules, Worker and Hosting...' -ForegroundColor Green
firebase deploy --only "firestore:rules,database"
if ($LASTEXITCODE -ne 0) { throw 'Rules deployment failed; hosting was stopped.' }
firebase deploy --only "hosting"
if ($LASTEXITCODE -ne 0) { throw 'Hosting/Worker deployment failed.' }
Write-Host ('Deploy complete: ' + $newVersion) -ForegroundColor Green
Write-Host 'Firebase: https://simplechat-65a0d.web.app' -ForegroundColor Cyan
