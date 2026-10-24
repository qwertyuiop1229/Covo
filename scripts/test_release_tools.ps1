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
