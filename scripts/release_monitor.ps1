# ASCII source: also parsed by Windows PowerShell 5.1 without a UTF-8 BOM.
function Select-CovoWorkflowRun {
    param($Runs, [string]$Commit, [string]$Workflow, [string]$Ref)
    return $Runs | Where-Object {
        $_.head_sha -eq $Commit -and $_.event -eq 'push' -and
        ($_.path -split '@')[0] -eq ('.github/workflows/' + $Workflow) -and $_.head_branch -eq $Ref
    } | Sort-Object -Property id -Descending | Select-Object -First 1
}

function Get-CovoCiSnapshot {
    param($Runs, [hashtable]$JobsByRun, [string]$Commit, [string]$Tag, [string]$Branch)
    $validation = Select-CovoWorkflowRun $Runs $Commit 'validate.yml' $Branch
    $release = Select-CovoWorkflowRun $Runs $Commit 'release.yml' $Tag
    $definitions = @(
        @{ Label = 'web-and-rules'; Run = $validation; Job = '^web-and-rules$' },
        @{ Label = 'native'; Run = $validation; Job = '^native$' },
        @{ Label = 'release'; Run = $release; Job = '^release \(windows-latest\)$' }
    )
    $failed = $false
    $allSucceeded = $true
    $rows = foreach ($definition in $definitions) {
        $run = $definition.Run
        $jobs = if ($run) { @($JobsByRun[[string]$run.id]) } else { @() }
        $job = $jobs | Where-Object { $_.name -match $definition.Job } | Select-Object -First 1
        $status = 'waiting for workflow'
        $detail = ''
        $url = if ($run) { $run.html_url } else { '' }
        if ($job) {
            $status = [string]$job.status
            if ($job.html_url) { $url = $job.html_url }
            if ($status -eq 'completed') {
                $status = [string]$job.conclusion
                if ($job.conclusion -ne 'success') { $failed = $true }
            }
            $steps = @($job.steps)
            $finished = @($steps | Where-Object { $_.status -eq 'completed' }).Count
            $active = $steps | Where-Object { $_.status -eq 'in_progress' } | Select-Object -First 1
            $detail = ('{0}/{1} steps' -f $finished, $steps.Count)
            if ($active) { $detail += ' - ' + $active.name }
        } elseif ($run) {
            $status = [string]$run.status
        }
        # A successful first job must never hide a cancelled/failed workflow.
        if ($run -and $run.status -eq 'completed' -and $run.conclusion -ne 'success') { $failed = $true }
        if (-not $run -or $run.status -ne 'completed' -or $run.conclusion -ne 'success' -or
            -not $job -or $job.status -ne 'completed' -or $job.conclusion -ne 'success') { $allSucceeded = $false }
        [pscustomobject]@{ Name = $definition.Label; Status = $status; Detail = $detail; Url = $url }
    }
    return [pscustomobject]@{ Rows = @($rows); Failed = $failed; Succeeded = ($allSucceeded -and -not $failed) }
}

function Invoke-CovoGitHubApi {
    param([string]$Repo, [string]$Path, [string]$Token)
    $headers = @{ 'User-Agent' = 'covo-deploy'; Accept = 'application/vnd.github+json' }
    if ($Token) { $headers.Authorization = 'Bearer ' + $Token }
    try {
        return Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $Repo + $Path) -Headers $headers -TimeoutSec 30 -ErrorAction Stop
    } catch {
        throw ('GitHub verification unavailable. Production was NOT deployed. Check https://github.com/' + $Repo + '/actions . ' + $_.Exception.Message)
    }
}

function Wait-CovoReleaseChecks {
    param([string]$Repo, [string]$Commit, [string]$Tag, [string]$Branch, [string]$Token, [int]$TimeoutSeconds = 3600)
    # At most three requests per poll: runs + validation jobs + release jobs.
    # Anonymous: 240s keeps normal monitoring below 60 requests/hour.
    $pollSeconds = if ($Token) { 20 } else { 240 }
    Write-Host ('Monitoring web-and-rules, native, release for commit ' + $Commit) -ForegroundColor Cyan
    Write-Host ('GitHub polling interval: ' + $pollSeconds + 's. Keep this terminal open; Firebase deployment runs here after all checks pass.') -ForegroundColor Yellow
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $response = Invoke-CovoGitHubApi $Repo ('/actions/runs?head_sha=' + $Commit + '&event=push&per_page=100') $Token
        $runs = @($response.workflow_runs)
        $jobsByRun = @{}
        $selected = @(
            (Select-CovoWorkflowRun $runs $Commit 'validate.yml' $Branch),
            (Select-CovoWorkflowRun $runs $Commit 'release.yml' $Tag)
        )
        foreach ($run in $selected) {
            if ($run) {
                $jobs = Invoke-CovoGitHubApi $Repo ('/actions/runs/' + $run.id + '/jobs?filter=latest&per_page=100') $Token
                $jobsByRun[[string]$run.id] = @($jobs.jobs)
            }
        }
        $snapshot = Get-CovoCiSnapshot $runs $jobsByRun $Commit $Tag $Branch
        Write-Host ('--- CI status (' + [int]$clock.Elapsed.TotalMinutes + ' min elapsed) ---') -ForegroundColor Cyan
        foreach ($row in $snapshot.Rows) {
            Write-Host ('  [{0}] {1}: {2}' -f $row.Status, $row.Name, $row.Detail)
            if ($row.Url) { Write-Host ('      ' + $row.Url) -ForegroundColor DarkGray }
        }
        if ($snapshot.Failed) { throw 'A required CI check failed or was cancelled. Firebase/Worker production deployment was stopped.' }
        if ($snapshot.Succeeded) { return }
        # Short sleeps keep Ctrl+C responsive; no background deployment is created.
        for ($second = 0; $second -lt $pollSeconds -and $clock.Elapsed.TotalSeconds -lt $TimeoutSeconds; $second++) { Start-Sleep -Seconds 1 }
    }
    throw 'CI verification timed out. Firebase/Worker production deployment was NOT started.'
}

function Assert-CovoPublishedRelease {
    param($Release, [string]$Tag)
    $assetNames = @($Release.assets | ForEach-Object { $_.name })
    if (-not $Release -or $Release.tag_name -ne $Tag -or $Release.draft -or $Release.prerelease -or
        'CovoSetup.exe' -notin $assetNames -or 'latest.json' -notin $assetNames -or
        -not ($assetNames | Where-Object { $_ -like '*.exe.sig' })) {
        throw 'The public Windows installer and signed updater are not ready; production deployment was stopped.'
    }
}
