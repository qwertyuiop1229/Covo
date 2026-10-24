$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release_monitor.ps1')
$script:assertions = 0
function Assert-Test {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:assertions++
}
function New-Fixture {
    $script:ciRuns = @(
        [pscustomobject]@{ id = 11; path = '.github/workflows/validate.yml'; head_branch = 'master'; head_sha = 'abc'; event = 'push'; status = 'completed'; conclusion = 'success'; html_url = 'validation' },
        [pscustomobject]@{ id = 12; path = '.github/workflows/release.yml'; head_branch = 'v1.1.283'; head_sha = 'abc'; event = 'push'; status = 'completed'; conclusion = 'success'; html_url = 'release' }
    )
    $script:ciJobs = @{
        '11' = @(
            [pscustomobject]@{ name = 'web-and-rules'; status = 'completed'; conclusion = 'success'; steps = @(); html_url = 'web' },
            [pscustomobject]@{ name = 'native'; status = 'completed'; conclusion = 'success'; steps = @(); html_url = 'native' }
        );
        '12' = @([pscustomobject]@{ name = 'release (windows-latest)'; status = 'completed'; conclusion = 'success'; steps = @(); html_url = 'release-job' })
    }
}
function Snapshot { Get-CovoCiSnapshot $script:ciRuns $script:ciJobs 'abc' 'v1.1.283' 'master' }

New-Fixture
$state = Snapshot
Assert-Test ($state.Succeeded -and -not $state.Failed -and $state.Rows.Count -eq 3) 'All three jobs must be displayed and accepted.'
foreach ($change in @('wrong-commit', 'wrong-tag', 'wrong-branch', 'wrong-event', 'wrong-workflow', 'pending-native', 'missing-job', 'pending-workflow')) {
    New-Fixture
    switch ($change) {
        'wrong-commit' { $ciRuns[1].head_sha = 'stale' }
        'wrong-tag' { $ciRuns[1].head_branch = 'v1.1.282' }
        'wrong-branch' { $ciRuns[0].head_branch = 'another' }
        'wrong-event' { $ciRuns[1].event = 'pull_request' }
        'wrong-workflow' { $ciRuns[1].path = '.github/workflows/untrusted.yml' }
        'pending-native' { $ciJobs['11'][1].status = 'in_progress'; $ciJobs['11'][1].conclusion = $null }
        'missing-job' { $ciJobs['11'] = @($ciJobs['11'][0]) }
        'pending-workflow' { $ciRuns[1].status = 'in_progress'; $ciRuns[1].conclusion = $null }
    }
    Assert-Test (-not (Snapshot).Succeeded) ('Must block rollout: ' + $change)
}
foreach ($change in @('failed-job', 'cancelled-workflow', 'skipped-job')) {
    New-Fixture
    switch ($change) {
        'failed-job' { $ciJobs['11'][1].conclusion = 'failure' }
        'cancelled-workflow' { $ciRuns[1].conclusion = 'cancelled' }
        'skipped-job' { $ciJobs['11'][1].conclusion = 'skipped' }
    }
    $state = Snapshot
    Assert-Test ($state.Failed -and -not $state.Succeeded) ('Must fail closed: ' + $change)
}
New-Fixture
$ciRuns += [pscustomobject]@{ id = 20; path = '.github/workflows/release.yml'; head_branch = 'v1.1.283'; head_sha = 'abc'; event = 'push'; status = 'in_progress'; conclusion = $null; html_url = 'rerun' }
Assert-Test (-not (Snapshot).Succeeded) 'A newer in-progress rerun must supersede old success.'

foreach ($change in @('valid', 'draft', 'prerelease', 'wrong-tag', 'missing-installer', 'missing-update', 'missing-signature')) {
    $release = [pscustomobject]@{ tag_name = 'v1.1.283'; draft = $false; prerelease = $false; assets = @(@{ name = 'CovoSetup.exe' }, @{ name = 'latest.json' }, @{ name = 'Covo.exe.sig' }) }
    switch ($change) {
        'draft' { $release.draft = $true }
        'prerelease' { $release.prerelease = $true }
        'wrong-tag' { $release.tag_name = 'v1.1.282' }
        'missing-installer' { $release.assets = @($release.assets | Where-Object { $_.name -ne 'CovoSetup.exe' }) }
        'missing-update' { $release.assets = @($release.assets | Where-Object { $_.name -ne 'latest.json' }) }
        'missing-signature' { $release.assets = @($release.assets | Where-Object { $_.name -notlike '*.sig' }) }
    }
    $accepted = $true
    try { Assert-CovoPublishedRelease $release 'v1.1.283' } catch { $accepted = $false }
    Assert-Test ($accepted -eq ($change -eq 'valid')) ('Release asset guard: ' + $change)
}

# Test quota calculations and conditional reads without reaching GitHub.
$testNow = [DateTime]::UtcNow
Assert-Test ((Get-CovoPollSeconds $false $null $testNow) -eq 30) 'Anonymous completion checks should normally use 30 seconds.'
Assert-Test ((Get-CovoPollSeconds $true $null $testNow) -eq 10) 'Authenticated completion checks should normally use 10 seconds.'
Assert-Test ((Get-CovoPollSeconds $false @{ Remaining = 8; Reset = $testNow.AddSeconds(90) } $testNow) -eq 92) 'Reserve eight requests until reset.'
Assert-Test ((Get-CovoPollSeconds $false @{ Remaining = 12; Reset = $testNow.AddSeconds(400) } $testNow) -eq 100) 'Low anonymous quota must slow polling.'
Assert-Test ((Get-CovoPollSeconds $false @{ Remaining = 0; Reset = $testNow.AddSeconds(-1) } $testNow) -eq 30) 'Expired quota windows must not block.'
$script:CovoApiRequests = New-Object 'System.Collections.Generic.List[datetime]'
$script:CovoApiCache = @{}
$script:CovoApiBudget = $null
$script:httpCalls = @()
$script:httpResponses = @(
    @{ Status = 200; Headers = @{ ETag = '"etag"'; 'X-RateLimit-Remaining' = '100'; 'X-RateLimit-Reset' = [DateTimeOffset]::UtcNow.AddHours(1).ToUnixTimeSeconds() }; Content = '{"value":42}' },
    @{ Status = 304; Headers = @{}; Content = '' }
)
function Invoke-CovoHttpGet {
    param([string]$Uri, [hashtable]$Headers)
    $script:httpCalls += @{ Uri = $Uri; Headers = $Headers.Clone() }
    return $script:httpResponses[$script:httpCalls.Count - 1]
}
Assert-Test ((Invoke-CovoGitHubApi 'test/repo' '/probe' 'test-token').value -eq 42) 'First API response must be decoded.'
Assert-Test ((Invoke-CovoGitHubApi 'test/repo' '/probe' 'test-token').value -eq 42) 'A 304 must reuse the exact cached body.'
Assert-Test ($httpCalls[1].Headers['If-None-Match'] -eq '"etag"') 'Conditional reads must send the stored ETag.'
Assert-Test ($httpCalls[1].Headers.Authorization -eq 'Bearer test-token') 'Conditional reads must retain authorization.'
Assert-Test ($script:CovoApiBudget.Remaining -eq 100) 'API quota must be read from response headers.'

# Exhausting the local anonymous request budget must wait before making HTTP requests.
$script:CovoApiRequests.Clear()
for ($index = 0; $index -lt 50; $index++) { $script:CovoApiRequests.Add([DateTime]::UtcNow) }
$script:CovoApiBudget = $null
$script:httpCalls = @()
$script:backoffs = 0
function Start-Sleep {
    param([int]$Seconds)
    $script:backoffs++
    $script:CovoApiRequests.Clear()
    $script:CovoApiNotBefore = [DateTime]::MinValue
}
[void](Invoke-CovoGitHubApi 'test/repo' '/budget' '')
Assert-Test ($backoffs -eq 1 -and $httpCalls.Count -eq 1) 'An exhausted anonymous budget must delay before sending.'

$script:httpCalls = @()
$script:httpResponses = @(
    @{ Status = 429; Headers = @{ 'Retry-After' = '2' }; Content = '' },
    @{ Status = 200; Headers = @{}; Content = '{"value":43}' }
)
Assert-Test ((Invoke-CovoGitHubApi 'test/repo' '/retry' '').value -eq 43) 'Retry-After must allow a later successful read.'
Assert-Test ($backoffs -eq 2 -and $httpCalls.Count -eq 2) 'A rate-limited response must back off before retrying.'
$script:CovoApiBudget = $null

# Exercise the actual polling entry point without networking, sleeping, or deploying.
New-Fixture
function Invoke-CovoGitHubApi {
    param([string]$Repo, [string]$Path, [string]$Token)
    if ($Path -eq '/actions/runs?head_sha=abc&event=push&per_page=100') { return @{ workflow_runs = $ciRuns } }
    if ($Path -eq '/actions/runs/11/jobs?filter=latest&per_page=100') { return @{ jobs = $ciJobs['11'] } }
    if ($Path -eq '/actions/runs/12/jobs?filter=latest&per_page=100') { return @{ jobs = $ciJobs['12'] } }
    throw ('Unexpected API request: ' + $Path)
}
Wait-CovoReleaseChecks -Repo 'test/repo' -Commit abc -Tag v1.1.283 -Branch master -Token ''
$ciJobs['11'][1].conclusion = 'failure'
$blocked = $false
try { Wait-CovoReleaseChecks -Repo 'test/repo' -Commit abc -Tag v1.1.283 -Branch master -Token '' } catch { $blocked = $true }
Assert-Test $blocked 'The monitor must throw on failed native validation.'
$blocked = $false
try { Wait-CovoReleaseChecks -Repo 'test/repo' -Commit abc -Tag v1.1.283 -Branch master -Token '' -TimeoutSeconds 0 } catch { $blocked = $true }
Assert-Test $blocked 'The monitor must throw on timeout.'

# Step details are cached, but a summary transition must trigger immediate final verification.
New-Fixture
$script:summaryReads = 0; $script:detailReads = 0
function Invoke-CovoGitHubApi {
    param([string]$Repo, [string]$Path, [string]$Token)
    if ($Path.StartsWith('/actions/runs?')) {
        $script:summaryReads++
        $ciRuns[1].status = if ($script:summaryReads -ge 3) { 'completed' } else { 'in_progress' }
        $ciRuns[1].conclusion = if ($script:summaryReads -ge 3) { 'success' } else { $null }
        return @{ workflow_runs = $ciRuns }
    }
    $script:detailReads++
    if ($Path.Contains('/11/jobs')) { return @{ jobs = $ciJobs['11'] } }
    if ($Path.Contains('/12/jobs')) {
        $ciJobs['12'][0].status = $ciRuns[1].status
        $ciJobs['12'][0].conclusion = $ciRuns[1].conclusion
        return @{ jobs = $ciJobs['12'] }
    }
    throw 'Unexpected request.'
}
Wait-CovoReleaseChecks -Repo 'test/repo' -Commit abc -Tag v1.1.283 -Branch master -Token ''
Assert-Test ($summaryReads -eq 3 -and $detailReads -eq 3) 'Three polls must use three summaries and only three detail reads, including immediate completion.'

# Parse using Windows PowerShell itself, not just pwsh or a UTF-8 string parser.
$root = Split-Path -Parent $PSScriptRoot
foreach ($relative in @('deploy.ps1', 'scripts/prepare_windows.ps1', 'scripts/build_windows_setup.ps1', 'scripts/release_monitor.ps1')) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $root $relative), [ref]$tokens, [ref]$errors)
    Assert-Test ($errors.Count -eq 0) ('PowerShell ParseFile failed: ' + $relative)
}
foreach ($relative in @('scripts/prepare_windows.ps1', 'scripts/build_windows_setup.ps1', 'scripts/release_monitor.ps1')) {
    $bytes = [IO.File]::ReadAllBytes((Join-Path $root $relative))
    Assert-Test (@($bytes | Where-Object { $_ -gt 127 }).Count -eq 0) ('Build/monitor scripts must stay ASCII without BOM: ' + $relative)
}
Write-Output ('Release tooling: ' + $assertions + ' assertions passed (PowerShell ' + $PSVersionTable.PSVersion.ToString() + ').')
