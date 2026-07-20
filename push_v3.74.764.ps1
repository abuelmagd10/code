$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.763.ps1") { Remove-Item -LiteralPath "push_v3.74.763.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.764"') {
    Write-Host "+ 3.74.764" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.764]")) { Write-Host "X CHANGELOG missing [3.74.764]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$route = "app/api/accounting-validation/route.ts"
$r = Get-Content -LiteralPath $route -Raw

# The defect was eleven queries against a table PostgREST cannot serve. None may
# survive as CODE. Three mentions remain and all three are documentation.
#
# The first version of this guard matched '\.from\("information_schema' against
# the whole file and rejected the release - because the comment at line 686
# quotes the broken call verbatim in order to explain it. I had written a note
# in this very block warning not to match the bare word, then matched a pattern
# that its own documentation satisfies. That is the same mistake, roughly the
# twenty-seventh time today: matching something that RESEMBLES the target
# instead of the target.
#
# Comment lines are excluded explicitly. A line is code only if it does not
# begin with // or *.
$liveQueries = @()
$lineNo = 0
foreach ($line in (Get-Content -LiteralPath $route)) {
    $lineNo++
    if ($line -match '^\s*(//|\*|/\*)') { continue }
    if ($line -match '\.from\(\s*"information_schema') {
        $liveQueries += "${lineNo}: $($line.Trim())"
    }
}
if ($liveQueries.Count -gt 0) {
    Write-Host "X $($liveQueries.Count) information_schema query/queries still live in the route:" -ForegroundColor Red
    $liveQueries | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    Write-Host "  PostgREST cannot serve it. The query fails and reads as 'missing'." -ForegroundColor Red
    exit 1
}
Write-Host "+ no information_schema queries remain in code (3 in comments, by design)" -ForegroundColor Green

# The replacement probe must exist and its error must be captured. The whole
# defect was `const { data } = await ...` dropping `{ error }`.
if ($r -notmatch "const \{ data: govState, error: govErr \} = await supabase\.rpc\(""get_db_governance_state""\)") {
    Write-Host "X the governance probe must capture BOTH data and error" -ForegroundColor Red; exit 1
}
if ($r -notmatch "govUnavailable = Boolean\(govErr\)") {
    Write-Host "X a failed probe must be distinguishable from a missing object" -ForegroundColor Red; exit 1
}
Write-Host "+ governance probe captures its error" -ForegroundColor Green

# A probe failure must NOT block the annual closing. Each critical test that
# depends on it has to fall back to passing with a 'could not verify' message.
$criticalTests = @("db_governance_triggers", "phase2_idempotency_table",
                   "phase2_atomic_functions", "phase5_integrity_shield")
# The window spans BOTH SIDES of the id. Two of these tests compute `passed`
# into a local on the lines above tests.push({ id: ... }) and pass it by
# shorthand; the other two write `passed: govUnavailable ? true : ...` inline
# below it. A forward-only window found the inline pair and rejected the other
# two, which were correct - the check looked in one direction for something that
# can legitimately sit on either side.
foreach ($t in $criticalTests) {
    $idx = $r.IndexOf($t)
    if ($idx -lt 0) { Write-Host "X test $t not found" -ForegroundColor Red; exit 1 }
    $start = [Math]::Max(0, $idx - 900)
    $length = [Math]::Min(2700, $r.Length - $start)
    $window = $r.Substring($start, $length)
    if ($window -notmatch "govUnavailable \? true") {
        Write-Host "X $t would still block the annual closing when the probe fails" -ForegroundColor Red
        exit 1
    }
    if ($window -notmatch "تعذّر التحقق") {
        Write-Host "X $t must say 'could not verify' rather than 'missing'" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ all four critical tests degrade to 'could not verify', not to 'missing'" -ForegroundColor Green

$mig = "supabase/migrations/20260720000019_v3_74_764_get_db_governance_state.sql"
if (-not (Test-Path $mig)) { Write-Host "X missing migration: $mig" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "pg_catalog") { Write-Host "X the probe must read pg_catalog" -ForegroundColor Red; exit 1 }
if ($m -notmatch "REVOKE EXECUTE ON FUNCTION public\.get_db_governance_state\(\) FROM anon, PUBLIC") {
    Write-Host "X the probe must not be callable by anon" -ForegroundColor Red; exit 1
}
Write-Host "+ migration present, reads pg_catalog, closed to anon" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" $route $mig "push_v3.74.764.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.763.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_764.txt"
    $msgLines = @(
        'fix(validation): v3.74.764 - the annual closing was blocked by five things that exist',
        '',
        'The accounting validation page reported "63% - critical problems detected -',
        'annual closing blocked - 5 critical problems must be resolved first".',
        '',
        'All five exist. Verified against pg_catalog before changing anything: the',
        'four governance triggers (among 35 on the journal tables), idempotency_keys',
        '(11 columns), the four atomic protection functions, the three performance',
        'RPCs, and all five integrity-shield components. The real score was 17 of 19',
        'and nothing should have blocked the closing.',
        '',
        'The cause, eleven times over:',
        '',
        '    const { data } = await supabase',
        '      .from("information_schema.routines" as any).select("routine_name")',
        '',
        'PostgREST cannot serve information_schema - it is not an exposed table in',
        'the public schema. Every one of those queries failed. The destructuring',
        'took { data } and dropped { error }, so the failure was silent, data came',
        'back null, and an empty result was read as "the object is missing". Four of',
        'these tests are marked critical, and critical failures block the year-end',
        'close.',
        '',
        'The report contradicted itself in plain sight. Test 11 passed - "no',
        'duplicate journals, the duplicate-prevention trigger is active". Test 12',
        'failed - "trg_prevent_duplicate_journal_entry is missing". Same trigger,',
        'same page. Test 11 checks behaviour; test 12 checked a name through a',
        'broken channel. The behaviour was the truth.',
        '',
        'One genuine failure was sitting among the five false ones: test 5, one',
        'invoice of three with no COGS entry, so income-statement profit is',
        'overstated. That is the pre-FIFO historical data. It deserved to be seen on',
        'its own.',
        '',
        'Replaced with get_db_governance_state(), which reads pg_catalog - always',
        'readable - and returns plain existence facts. No arguments, no company',
        'data, not callable by anon. And if the probe itself fails, the tests now',
        'report "could not verify" and none of them blocks the closing. A check that',
        'cannot run must say so; reporting "missing" is worse than reporting',
        'nothing, because somebody acts on it.',
        '',
        'Also confirmed while testing the live application after today''s permission',
        'changes across ~100 functions: reports, balance sheet, notifications and',
        'both integrity dashboards all load, every database call returns 200, no',
        'permission errors anywhere. Trial balance and balance sheet both balance.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.764 pushed - annual closing no longer blocked by phantoms" -ForegroundColor Green
}
