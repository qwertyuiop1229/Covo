# Covo Deploy Script
# Usage: .\deploy.ps1       (interactive confirm)
#        .\deploy.ps1 -y    (skip confirm)
#        npm run deploy      (optional update)
#        npm run deploy:force (forced update)

param(
    [switch]$y,
    [switch]$force
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
if ($force) {
    Write-Host 'Update Mode: FORCED  (force:true  / close button hidden)' -ForegroundColor Red
} else {
    Write-Host 'Update Mode: OPTIONAL (force:false / close button shown)'  -ForegroundColor Green
}
Write-Host ''

# [0/5] Tailwind CSS
Write-Host '[0/5] Building Tailwind CSS...' -ForegroundColor Green
node_modules\.bin\tailwindcss.cmd -i tailwind.input.css -o public/styles.css --minify

# [1/5] version.json + tauri.conf.json
$forceStr = if ($force) { 'true' } else { 'false' }
$vjContent = "{`n  `"version`": `"$newVersion`",`n  `"force`": $forceStr`n}`n"
[System.IO.File]::WriteAllText($versionJsonPath, $vjContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[1/5] Updated version.json -> $newVersion  (force: $forceStr)" -ForegroundColor Green

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

# [2/5] git commit
Write-Host '[2/5] Committing changes...' -ForegroundColor Green
git add -A
git commit -m "Release v$newVersion"

# [3/5] git tag
Write-Host "[3/5] Creating tag $tagName ..." -ForegroundColor Green
git tag $tagName

# [4/5] Firebase
Write-Host '[4/5] Deploying to Firebase...' -ForegroundColor Green
firebase deploy --only "hosting,firestore:rules,database"

# [5/5] git push
Write-Host '[5/5] Pushing to GitHub...' -ForegroundColor Green
git push origin HEAD --tags

Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host '  Deploy complete!' -ForegroundColor Green
Write-Host "  Version : $newVersion" -ForegroundColor Green
Write-Host "  Tag     : $tagName"    -ForegroundColor Green
if ($force) {
    Write-Host '  Mode    : FORCED UPDATE  (force:true)' -ForegroundColor Red
} else {
    Write-Host '  Mode    : OPTIONAL UPDATE (force:false)' -ForegroundColor Green
}
Write-Host '====================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Firebase : https://simplechat-65a0d.web.app' -ForegroundColor Yellow
Write-Host 'GitHub   : https://github.com/qwertyuiop1229/Covo/actions' -ForegroundColor Yellow
Write-Host ''

# ===========================================================================
# GitHub Actions real-time build monitor
# ===========================================================================
Write-Host '====================================' -ForegroundColor DarkCyan
Write-Host '  GitHub Actions Build Monitor'      -ForegroundColor Cyan
Write-Host '====================================' -ForegroundColor DarkCyan
Write-Host '(Ctrl+C to exit at any time)'        -ForegroundColor DarkGray
Write-Host ''

$REPO             = 'qwertyuiop1229/Covo'
$GITHUB_TOKEN_ENV = $env:GITHUB_TOKEN

# Move cursor up N lines (ANSI)
function Move-CursorUp {
    param([int]$Lines)
    if ($Lines -gt 0) {
        $esc = [char]27
        $seq = $esc.ToString() + '[' + $Lines.ToString() + 'A'
        [Console]::Write($seq)
    }
}

# ASCII progress bar  [####....] 64%
function Draw-Bar {
    param([int]$Pct, [int]$W = 24)
    $Pct    = [Math]::Max(0, [Math]::Min(100, $Pct))
    $filled = [int]([Math]::Floor($W * ($Pct / 100)))
    $empty  = $W - $filled
    return '[' + ('#' * $filled) + ('.' * $empty) + '] ' + $Pct + '%'
}

# GitHub REST API helper
function Invoke-GHApi {
    param([string]$Path)
    $url     = 'https://api.github.com' + $Path
    $headers = @{ 'User-Agent' = 'covo-deploy'; 'Accept' = 'application/vnd.github+json' }
    if ($GITHUB_TOKEN_ENV) { $headers['Authorization'] = 'Bearer ' + $GITHUB_TOKEN_ENV }
    try   { return Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop }
    catch { return $null }
}

function Get-LatestRun {
    param([string]$Tag)
    $res = Invoke-GHApi -Path ('/repos/' + $REPO + '/actions/runs?event=push&per_page=15')
    if (-not $res) { return $null }
    $run = $res.workflow_runs | Where-Object {
        ($_.head_branch -eq $Tag) -or
        ($_.head_commit.message -like ('*' + $Tag + '*')) -or
        ($_.display_title -like ('*' + $Tag + '*'))
    } | Select-Object -First 1
    # 誤検知を防ぐため、タグに一致しない古いRunへのフォールバックは行いません
    return $run
}

function Get-RunJobs {
    param([string]$RunId)
    $res = Invoke-GHApi -Path ('/repos/' + $REPO + '/actions/runs/' + $RunId + '/jobs')
    if ($res) { return $res.jobs }
    return @()
}

# Detect latest run (up to 45 s)
Write-Host ('>> Searching for GitHub Actions run for tag ' + $tagName + ' ...') -ForegroundColor Cyan
$run = $null
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 3
    $run = Get-LatestRun -Tag $tagName
    if ($run) { break }
    Write-Host ('   Attempt ' + $i + '/15 ... (waiting for GitHub to queue workflow)') -ForegroundColor DarkGray
}

if (-not $run) {
    Write-Host ''
    Write-Host '!! Run not detected within 45s. (GitHub Actions might be taking longer to queue)' -ForegroundColor Yellow
    Write-Host '   The deployment (git push & Firebase) was SUCCESSFUL.' -ForegroundColor Green
    Write-Host '   Please check the build progress manually in your browser:' -ForegroundColor Yellow
    Write-Host ('   https://github.com/' + $REPO + '/actions') -ForegroundColor Yellow
    exit 0
}

$runId  = $run.id
$runUrl = $run.html_url
Write-Host ''
Write-Host ('>> Run found: #' + $runId) -ForegroundColor Green
Write-Host ('   ' + $runUrl)           -ForegroundColor DarkGray
Write-Host ''

$StepDefs = @(
    [pscustomobject]@{ Pattern = 'checkout';         Label = 'Checkout source';       Weight = 2  }
    [pscustomobject]@{ Pattern = 'install Node';     Label = 'Setup Node.js';         Weight = 3  }
    [pscustomobject]@{ Pattern = 'install Rust';     Label = 'Setup Rust toolchain';  Weight = 5  }
    [pscustomobject]@{ Pattern = 'Rust Cache';       Label = 'Restore Rust cache';    Weight = 3  }
    [pscustomobject]@{ Pattern = 'install frontend'; Label = 'npm install';           Weight = 8  }
    [pscustomobject]@{ Pattern = 'build tauri';      Label = 'Build Tauri (~20 min)'; Weight = 70 }
    [pscustomobject]@{ Pattern = 'upload';           Label = 'Upload release assets'; Weight = 9  }
)
$totalWeight = ($StepDefs | Measure-Object -Property Weight -Sum).Sum

$Spinners   = @('-', '\', '|', '/')
$spinIdx    = 0
$pollSec    = 6
$maxPolls   = [int]((45 * 60) / $pollSec)
$firstDraw  = $true
$LINE_COUNT = 4

Write-Host '-- GitHub Actions Live Build Log --' -ForegroundColor Cyan
Write-Host ('   ' + $REPO + '  |  Run #' + $runId) -ForegroundColor DarkGray
Write-Host ''

for ($poll = 0; $poll -lt $maxPolls; $poll++) {

    $jobs = Get-RunJobs -RunId $runId
    $spin = $Spinners[$spinIdx % $Spinners.Length]
    $spinIdx++

    if (-not $firstDraw) { Move-CursorUp -Lines $LINE_COUNT }
    $firstDraw = $false

    if ($jobs -and $jobs.Count -gt 0) {
        $job           = $jobs[0]
        $jobStatus     = $job.status
        $jobConclusion = $job.conclusion
        $steps         = $job.steps

        $completedWeight    = 0
        $completedStepCount = 0
        $currentLabel       = ''
        $totalStepCount     = if ($steps) { $steps.Count } else { 0 }

        if ($steps) {
            foreach ($step in $steps) {
                $def = $StepDefs | Where-Object { $step.name -like ('*' + $_.Pattern + '*') } | Select-Object -First 1
                $w   = if ($def) { $def.Weight } else { 2 }
                if ($step.status -eq 'completed' -and $step.conclusion -eq 'success') {
                    $completedWeight    += $w
                    $completedStepCount++
                } elseif ($step.status -eq 'in_progress') {
                    $completedWeight += [int]($w * 0.5)
                    $currentLabel     = if ($def) { $def.Label } else { $step.name }
                }
            }
        }

        $pct = if ($totalWeight -gt 0) { [int]([Math]::Min(99, ($completedWeight / $totalWeight) * 100)) } else { 0 }
        if ($jobStatus -eq 'completed' -and $jobConclusion -eq 'success') { $pct = 100 }

        $bar = Draw-Bar -Pct $pct

        if ($jobStatus -eq 'completed') {
            if ($jobConclusion -eq 'success') {
                $icon = '[OK]'; $col = 'Green'; $lbl = 'Build succeeded!'
            } else {
                $icon = '[NG]'; $col = 'Red'; $lbl = 'Build FAILED (' + $jobConclusion + ')'
            }
        } elseif ($jobStatus -eq 'queued') {
            $icon = '[ ]'; $col = 'Yellow'; $lbl = 'Queued...'
        } else {
            $icon = '[' + $spin + ']'; $col = 'Cyan'; $lbl = 'Building...'
        }

        $l1 = ('  ' + $icon + '  ' + $lbl + '  [Step ' + $completedStepCount + '/' + $totalStepCount + ']').PadRight(70)
        $l2 = ('  ' + $bar).PadRight(70)
        $l3 = if ($currentLabel) { ('  -> ' + $currentLabel).PadRight(70) } else { ' ' * 70 }
        $l4 = ('  Run #' + $runId + ' | ' + $runUrl).PadRight(70)

        Write-Host $l1 -ForegroundColor $col
        Write-Host $l2 -ForegroundColor White
        Write-Host $l3 -ForegroundColor DarkCyan
        Write-Host $l4 -ForegroundColor DarkGray

        if ($jobStatus -eq 'completed') {
            Write-Host ''
            if ($jobConclusion -eq 'success') {
                Write-Host '  SUCCESS: Build and release complete.' -ForegroundColor Green
                Write-Host ('  Release: https://github.com/' + $REPO + '/releases/tag/' + $tagName) -ForegroundColor Cyan
            } else {
                Write-Host ('  FAILED: ' + $jobConclusion) -ForegroundColor Red
                Write-Host ('  Details: ' + $runUrl)       -ForegroundColor Yellow
            }
            Write-Host ''
            break
        }

    } else {
        Write-Host ('[' + $spin + '] Fetching run #' + $runId + ' ...').PadRight(70) -ForegroundColor DarkGray
        Write-Host (' ' * 70)
        Write-Host (' ' * 70)
        Write-Host (' ' * 70)
    }

    Start-Sleep -Seconds $pollSec
}
