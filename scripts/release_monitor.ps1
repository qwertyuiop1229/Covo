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

function Invoke-CovoHttpGet {
    param([string]$Uri, [hashtable]$Headers)
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $Uri)
    $response = $null
    try {
        foreach ($name in $Headers.Keys) { [void]$request.Headers.TryAddWithoutValidation($name, [string]$Headers[$name]) }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $responseHeaders = @{}
        foreach ($header in $response.Headers) { $responseHeaders[$header.Key] = $header.Value -join ',' }
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Headers = $responseHeaders; Content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() }
    } finally {
        if ($response) { $response.Dispose() }
        $request.Dispose(); $client.Dispose()
    }
}

function Get-CovoPollSeconds {
    param([bool]$Authenticated, $Budget, [datetime]$Now = [DateTime]::UtcNow)
    $delay = if ($Authenticated) { 10 } else { 30 }
    if ($Budget -and $Budget.Reset -gt $Now) {
        if ($Budget.Remaining -le 8) { return [int][Math]::Ceiling(($Budget.Reset - $Now).TotalSeconds + 2) }
        if (-not $Authenticated -and $Budget.Remaining -le 12) {
            $delay = [Math]::Max($delay, [Math]::Ceiling(($Budget.Reset - $Now).TotalSeconds / ($Budget.Remaining - 8)))
        }
    }
    return [int]$delay
}

function Invoke-CovoGitHubApi {
    param([string]$Repo, [string]$Path, [string]$Token, [datetime]$Deadline = [DateTime]::MaxValue)
    if (-not $script:CovoApiRequests) { $script:CovoApiRequests = New-Object 'System.Collections.Generic.List[datetime]' }
    if (-not $script:CovoApiCache) { $script:CovoApiCache = @{} }
    $headers = @{ 'User-Agent' = 'covo-deploy'; Accept = 'application/vnd.github+json' }
    if ($Token) { $headers.Authorization = 'Bearer ' + $Token }
    $cacheKey = $Repo + $Path + [bool]$Token
    $cached = $script:CovoApiCache[$cacheKey]
    if ($cached -and $cached.ETag) { $headers['If-None-Match'] = $cached.ETag }
    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        # Reserve quota for publication verification and other tools sharing this IP.
        while ($true) {
            $now = [DateTime]::UtcNow
            if ($now -ge $Deadline) { throw 'GitHub verification timed out before production deployment.' }
            $recent = @($script:CovoApiRequests | Where-Object { $_ -gt $now.AddHours(-1) })
            $delay = 0
            if ($script:CovoApiBudget -and $script:CovoApiBudget.Reset -gt $now -and $script:CovoApiBudget.Remaining -le 8) {
                $delay = [Math]::Ceiling(($script:CovoApiBudget.Reset - $now).TotalSeconds + 2)
            }
            if (-not $Token -and $recent.Count -ge 50) { $delay = [Math]::Max($delay, [Math]::Ceiling(($recent[0].AddHours(1) - $now).TotalSeconds + 2)) }
            if ($script:CovoApiNotBefore -gt $now) { $delay = [Math]::Max($delay, [Math]::Ceiling(($script:CovoApiNotBefore - $now).TotalSeconds)) }
            if ($delay -le 0) { break }
            Write-Host ('GitHub quota/backoff: waiting up to ' + [int]$delay + 's before the next request.') -ForegroundColor Yellow
            Start-Sleep -Seconds ([int][Math]::Min(30.0, [Math]::Min([double]$delay, [Math]::Max(1.0, ($Deadline - $now).TotalSeconds))))
        }
        $script:CovoApiRequests.Add([DateTime]::UtcNow)
        try { $response = Invoke-CovoHttpGet ('https://api.github.com/repos/' + $Repo + $Path) $headers }
        catch { throw ('GitHub verification unavailable. Production was NOT deployed. Check https://github.com/' + $Repo + '/actions . ' + $_.Exception.Message) }
        $remaining = 0; $reset = [long]0
        if ([int]::TryParse([string]$response.Headers['X-RateLimit-Remaining'], [ref]$remaining) -and
            [long]::TryParse([string]$response.Headers['X-RateLimit-Reset'], [ref]$reset)) {
            $script:CovoApiBudget = @{ Remaining = $remaining; Reset = [DateTimeOffset]::FromUnixTimeSeconds($reset).UtcDateTime }
        }
        if ($response.Status -eq 304 -and $cached) { return $cached.Body }
        if ($response.Status -eq 200) {
            $body = $response.Content | ConvertFrom-Json
            if ($script:CovoApiCache.Count -ge 16) { $script:CovoApiCache.Clear() }
            $script:CovoApiCache[$cacheKey] = @{ ETag = $response.Headers['ETag']; Body = $body }
            return $body
        }
        if ($response.Status -in @(403, 429) -and ($response.Headers['Retry-After'] -or $response.Headers['X-RateLimit-Remaining'] -eq '0')) {
            $retry = 60; $parsedRetry = 0
            if ([int]::TryParse([string]$response.Headers['Retry-After'], [ref]$parsedRetry)) { $retry = [Math]::Max(1, $parsedRetry) }
            $script:CovoApiNotBefore = [DateTime]::UtcNow.AddSeconds($retry)
            continue
        }
        throw ('GitHub verification failed (HTTP ' + $response.Status + '). Production was NOT deployed. https://github.com/' + $Repo + '/actions')
    }
    throw 'GitHub kept rejecting verification requests. Production was NOT deployed.'
}

function Wait-CovoReleaseChecks {
    param([string]$Repo, [string]$Commit, [string]$Tag, [string]$Branch, [string]$Token, [int]$TimeoutSeconds = 3600)
    $pollSeconds = Get-CovoPollSeconds ([bool]$Token) $script:CovoApiBudget
    Write-Host ('Monitoring web-and-rules, native, release for commit ' + $Commit) -ForegroundColor Cyan
    Write-Host ('GitHub polling interval: ' + $pollSeconds + 's. Keep this terminal open; Firebase deployment runs here after all checks pass.') -ForegroundColor Yellow
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $jobsByRun = @{}
    $jobRefreshes = @{}
    $jobRunStates = @{}
    while ($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        # One summary request detects completion of both workflows.
        $response = Invoke-CovoGitHubApi $Repo ('/actions/runs?head_sha=' + $Commit + '&event=push&per_page=100') $Token $deadline
        $runs = @($response.workflow_runs)
        $selected = @(
            (Select-CovoWorkflowRun $runs $Commit 'validate.yml' $Branch),
            (Select-CovoWorkflowRun $runs $Commit 'release.yml' $Tag)
        )
        foreach ($run in $selected) {
            if ($run) {
                $key = [string]$run.id
                $state = [string]$run.status + ':' + [string]$run.conclusion + ':' + [string]$run.run_attempt
                $detailInterval = if ($Token) { 60 } else { 300 }
                # Completed jobs are fetched once. Refresh immediately on terminal state or rerun.
                if (-not $jobsByRun.ContainsKey($key) -or $jobRunStates[$key] -ne $state -or
                    ($run.status -ne 'completed' -and ($clock.Elapsed.TotalSeconds - $jobRefreshes[$key]) -ge $detailInterval)) {
                    $jobs = Invoke-CovoGitHubApi $Repo ('/actions/runs/' + $run.id + '/jobs?filter=latest&per_page=100') $Token $deadline
                    $jobsByRun[$key] = @($jobs.jobs)
                    $jobRefreshes[$key] = $clock.Elapsed.TotalSeconds
                    $jobRunStates[$key] = $state
                }
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
        $pollSeconds = Get-CovoPollSeconds ([bool]$Token) $script:CovoApiBudget
        Write-Host ('Next completion check in ' + $pollSeconds + 's; job step details refresh less often.') -ForegroundColor DarkGray
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
