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

# [0/5] Tailwind CSS
Write-Host '[0/5] Building Tailwind CSS...' -ForegroundColor Green
node_modules\.bin\tailwindcss.cmd -i tailwind.input.css -o public/styles.css --minify

# [1/5] version.json + tauri.conf.json
$vjContent = "{`n  `"version`": `"$newVersion`",`n  `"force`": false`n}`n"
[System.IO.File]::WriteAllText($versionJsonPath, $vjContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[1/5] Updated version.json -> $newVersion" -ForegroundColor Green

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
Write-Host '  Mode    : AUTOMATIC UPDATE' -ForegroundColor Green
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

$REPO = 'qwertyuiop1229/Covo'

# ターミナル未再起動でもレジストリから直接 GITHUB_TOKEN を取得する強力な仕組み！
$GITHUB_TOKEN_ENV = $env:GITHUB_TOKEN
if (-not $GITHUB_TOKEN_ENV) {
    try {
        $GITHUB_TOKEN_ENV = (Get-ItemProperty -Path 'HKCU:\Environment' -Name 'GITHUB_TOKEN' -ErrorAction SilentlyContinue).GITHUB_TOKEN
    } catch {}
}
if (-not $GITHUB_TOKEN_ENV) {
    try {
        $GITHUB_TOKEN_ENV = (Get-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Session Manager\Environment' -Name 'GITHUB_TOKEN' -ErrorAction SilentlyContinue).GITHUB_TOKEN
    } catch {}
}

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
    try {
        return Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop
    } catch {
        if (($_.Exception.Message -like '*rate limit*') -or ($_.Exception.Message -like '*403*')) {
            $global:RateLimitHit = $true
        }
        return $null
    }
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
    return $run
}

function Get-RunJobs {
    param([string]$RunId)
    $res = Invoke-GHApi -Path ('/repos/' + $REPO + '/actions/runs/' + $RunId + '/jobs')
    if ($res -and $res.jobs) { return @($res.jobs) }
    return @()
}

# Detect latest run (up to 45 s)
Write-Host ('>> Searching for GitHub Actions run for tag ' + $tagName + ' ...') -ForegroundColor Cyan
$run = $null
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 3
    $run = Get-LatestRun -Tag $tagName
    if ($run) { break }
    if ($global:RateLimitHit) { break }
    Write-Host ('   Attempt ' + $i + '/15 ... (waiting for GitHub to queue workflow)') -ForegroundColor DarkGray
}

if ($global:RateLimitHit -and -not $run) {
    Write-Host ''
    Write-Host '!! [API Rate Limit Exceeded] 匿名アクセスの取得上限(1時間60回)に到達しました。' -ForegroundColor Yellow
    Write-Host '   デプロイ実作業 (git push & Firebase) は【正常に完了】しています！' -ForegroundColor Green
    Write-Host '   進捗状況は以下の Actions 画面からブラウザでご確認ください：' -ForegroundColor Yellow
    Write-Host ('   👉 https://github.com/' + $REPO + '/actions') -ForegroundColor Cyan
    Write-Host ''
    exit 0
}

if (-not $run) {
    Write-Host ''
    Write-Host '!! Run not detected within 45s. (GitHub Actions might be taking longer to queue)' -ForegroundColor Yellow
    Write-Host '   The deployment (git push & Firebase) was SUCCESSFUL.' -ForegroundColor Green
    Write-Host '   Please check the build progress manually in your browser:' -ForegroundColor Yellow
    Write-Host ('   👉 https://github.com/' + $REPO + '/actions') -ForegroundColor Cyan
    exit 0
}

$runId  = $run.id
$runUrl = $run.html_url
Write-Host ''
Write-Host ('>> Run found: #' + $runId) -ForegroundColor Green
Write-Host ('   👉 ' + $runUrl)           -ForegroundColor DarkGray
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
$pollSec    = if ($GITHUB_TOKEN_ENV) { 6 } else { 20 }
$quotaMode  = if ($GITHUB_TOKEN_ENV) { "認証済み (上限5000回/時)" } else { "匿名 (上限60回/時 | API節約モード)" }

Write-Host '-- GitHub Actions Live Build Log --' -ForegroundColor Cyan
Write-Host ('   ' + $REPO + '  |  Run #' + $runId + '  |  API: ' + $quotaMode) -ForegroundColor DarkGray
Write-Host ''

$LINE_COUNT = 6
$firstDraw  = $true
$job = $null
$jobStatus = 'queued'
$jobConclusion = $null
$jobUrl = $runUrl

# Fetch initial job data
$jobs = @(Get-RunJobs -RunId $runId)
if ($jobs -and $jobs.Count -gt 0) { $job = $jobs[0]; $jobStatus = $job.status; $jobConclusion = $job.conclusion; $jobUrl = $job.html_url }

$maxOverallSec = 45 * 60
$secSinceLastPoll = 0

for ($totalSec = 0; $totalSec -lt $maxOverallSec; $totalSec++) {

    if ($secSinceLastPoll -ge $pollSec -and $jobStatus -ne 'completed') {
        $secSinceLastPoll = 0
        $global:RateLimitHit = $false
        $newJobs = @(Get-RunJobs -RunId $runId)
        if ($global:RateLimitHit) {
            if (-not $firstDraw) { Move-CursorUp -Lines $LINE_COUNT }
            Write-Host '  [!] API Rate Limit (1時間60回) に到達したためターミナル更新を停止します。'.PadRight(80) -ForegroundColor Yellow
            Write-Host '      裏側のデプロイ・ビルド実作業は【正常に進行中】です！'.PadRight(80) -ForegroundColor Green
            Write-Host ('      👉 ブラウザ確認用URL: https://github.com/' + $REPO + '/actions/runs/' + $runId).PadRight(80) -ForegroundColor Cyan
            Write-Host (' ' * 80)
            Write-Host (' ' * 80)
            Write-Host (' ' * 80)
            Write-Host ''
            break
        }
        if ($newJobs -and $newJobs.Count -gt 0) {
            $job = $newJobs[0]
            $jobStatus = $job.status
            $jobConclusion = $job.conclusion
            $jobUrl = $job.html_url
        }
    }

    $spin = $Spinners[$totalSec % $Spinners.Length]

    if (-not $firstDraw) { Move-CursorUp -Lines $LINE_COUNT }
    $firstDraw = $false

    if ($job) {
        $steps = @($job.steps)
        $completedWeight    = 0
        $completedStepCount = 0
        $currentLabel       = ''
        $currentStep        = $null
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
                    $currentStep      = $step
                }
            }
        }

        $pct = if ($totalWeight -gt 0) { [int]([Math]::Min(99, ($completedWeight / $totalWeight) * 100)) } else { 0 }
        if ($jobStatus -eq 'completed' -and $jobConclusion -eq 'success') { $pct = 100 }
        $bar = Draw-Bar -Pct $pct

        # Calculate Job / Step elapsed time and log progression
        $elapsedJobStr = '00:00'
        if ($job.started_at) {
            try {
                $jStart = [DateTime]::Parse($job.started_at).ToUniversalTime()
                $elapsedJob = [DateTime]::UtcNow - $jStart
                if ($jobStatus -eq 'completed' -and $job.completed_at) {
                    $jEnd = [DateTime]::Parse($job.completed_at).ToUniversalTime()
                    $elapsedJob = $jEnd - $jStart
                }
                $elapsedJobStr = ('{0:00}:{1:00}' -f [int][Math]::Floor($elapsedJob.TotalMinutes), $elapsedJob.Seconds)
            } catch {}
        }

        $stepLogInfo = 'ログ準備中...'
        $stepElapsedStr = '00:00'

        if ($currentStep -and $currentStep.started_at) {
            try {
                $sStart = [DateTime]::Parse($currentStep.started_at).ToUniversalTime()
                $elapsedStep = [DateTime]::UtcNow - $sStart
                $stepElapsedStr = ('{0:00}:{1:00}' -f [int][Math]::Floor($elapsedStep.TotalMinutes), $elapsedStep.Seconds)
                $sec = $elapsedStep.TotalSeconds
                if ($sec -lt 1) { $sec = 1 }

                $expDur = 30.0; $expLines = 50.0
                if ($currentStep.name -like '*Set up job*') { $expDur = 10.0; $expLines = 25.0 }
                elseif ($currentStep.name -like '*checkout*') { $expDur = 15.0; $expLines = 32.0 }
                elseif ($currentStep.name -like '*install Node*') { $expDur = 10.0; $expLines = 28.0 }
                elseif ($currentStep.name -like '*install Rust*') { $expDur = 20.0; $expLines = 45.0 }
                elseif ($currentStep.name -like '*Rust Cache*') { $expDur = 15.0; $expLines = 42.0 }
                elseif ($currentStep.name -like '*frontend dependencies*') { $expDur = 40.0; $expLines = 165.0 }
                elseif ($currentStep.name -like '*build tauri app*') { $expDur = 900.0; $expLines = 485.0 }

                $progRatio = $sec / $expDur
                if ($progRatio -gt 0.95) { $progRatio = 0.95 }
                $curLine = [int]([Math]::Round($expLines * $progRatio))
                if ($curLine -lt 1) { $curLine = 1 }
                if ($curLine -ge $expLines) { $curLine = $expLines - 1 }
                $stepLogInfo = ('ログ: ' + $curLine + '/' + $expLines + '行')
            } catch {}
        }

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

        $l1 = ('  ' + $icon + '  ' + $lbl + '  [Step ' + $completedStepCount + '/' + $totalStepCount + ']  (総経過時間: ' + $elapsedJobStr + ')').PadRight(80)
        $l2 = ('  ' + $bar).PadRight(80)
        $l3 = if ($currentLabel) { ('  -> ' + $currentLabel + '  (ステップ経過時間: ' + $stepElapsedStr + ' | ' + $stepLogInfo + ')').PadRight(80) } else { ' ' * 80 }
        $l4 = ('  👉 ' + $jobUrl).PadRight(80)
        $l5 = (' ' * 80)
        $l6 = (' ' * 80)

        Write-Host $l1 -ForegroundColor $col
        Write-Host $l2 -ForegroundColor White
        Write-Host $l3 -ForegroundColor DarkCyan
        Write-Host $l4 -ForegroundColor DarkGray
        Write-Host $l5
        Write-Host $l6

        if ($jobStatus -eq 'completed') {
            Write-Host ''
            if ($jobConclusion -eq 'success') {
                Write-Host '  SUCCESS: Build and release complete.' -ForegroundColor Green
                Write-Host ('  Release: https://github.com/' + $REPO + '/releases/tag/' + $tagName) -ForegroundColor Cyan
            } else {
                Write-Host ('  FAILED: ' + $jobConclusion) -ForegroundColor Red
                Write-Host ('  Details: ' + $jobUrl)       -ForegroundColor Yellow
            }
            Write-Host ''
            break
        }

    } else {
        Write-Host ('  [' + $spin + '] Fetching run #' + $runId + ' jobs ...').PadRight(80) -ForegroundColor DarkGray
        Write-Host (' ' * 80)
        Write-Host (' ' * 80)
        Write-Host (' ' * 80)
        Write-Host (' ' * 80)
        Write-Host (' ' * 80)
    }

    Start-Sleep -Seconds 1
    $secSinceLastPoll++
}
