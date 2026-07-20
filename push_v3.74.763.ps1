$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.762.ps1") { Remove-Item -LiteralPath "push_v3.74.762.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.763"') {
    Write-Host "+ 3.74.763" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.763]")) { Write-Host "X CHANGELOG missing [3.74.763]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$quiet = "supabase/migrations/20260720000017_v3_74_763_readers_check_one_row_not_104.sql"
$close = "supabase/migrations/20260720000018_v3_74_763_close_ic_checkers_to_anon.sql"
foreach ($m in @($quiet, $close)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}

# The whole point of the first migration is that the check emits ONE row.
# If it ever goes back to returning a row per function it drowns the dashboard.
$q = Get-Content -LiteralPath $quiet -Raw
if ($q -notmatch "open_reader_count") {
    Write-Host "X the readers check must summarise, not enumerate" -ForegroundColor Red; exit 1
}
if ($q -match "(?m)^\s*RETURN QUERY\s*$") {
    Write-Host "X RETURN QUERY with no aggregation - this is the 104-row shape again" -ForegroundColor Red
    exit 1
}
$returnQueryCount = ([regex]::Matches($q, "RETURN QUERY")).Count
if ($returnQueryCount -ne 1) {
    Write-Host "X expected exactly one RETURN QUERY in the summary check, found $returnQueryCount" -ForegroundColor Red
    exit 1
}
Write-Host "+ readers check emits a single summary row" -ForegroundColor Green

# Same PUBLIC lesson as v3.74.762. Revoking the role alone is a no-op.
$c = Get-Content -LiteralPath $close -Raw
if ($c -notmatch "REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC") {
    Write-Host "X the revoke must name PUBLIC - anon inherits EXECUTE from it" -ForegroundColor Red; exit 1
}
if ($c -notmatch "GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role") {
    Write-Host "X revoking PUBLIC without re-granting would break the dashboard and the cron" -ForegroundColor Red
    exit 1
}
if ($c -notmatch "pg_policy") {
    Write-Host "X RLS-policy helpers must be excluded via pg_policy, not by name" -ForegroundColor Red; exit 1
}
Write-Host "+ ic_* revoke names PUBLIC, re-grants the app, spares RLS helpers" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" $quiet $close "push_v3.74.763.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.762.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_763.txt"
    $msgLines = @(
        'fix(integrity): v3.74.763 - I drowned the dashboard yesterday; 52 checkers closed',
        '',
        'The check added in v3.74.762 returned one row per function: 104 rows. It',
        'reports an infrastructure fact, identical for every company, so the nightly',
        'run produced 416 identical rows across four companies, none of them about',
        'anyone''s data.',
        '',
        'Worse, it was all the dashboard showed. run_all_integrity_checks returned',
        '104 rows and every one came from this check. Every accounting and inventory',
        'checker returned zero, correctly, and their silence was invisible',
        'underneath. A real problem tomorrow would have been one row in 105.',
        '',
        'What caught it: four different companies returning the identical count 104.',
        'Accounting data does not do that.',
        '',
        'This is the noise failure the trigger-function exclusion avoided in .759,',
        'walked into from the other direction two releases later. A checker that',
        'shouts the same thing every night is not a checker, it is wallpaper, and',
        'people stop reading wallpaper. One summary row now: 104 to 1 per company.',
        '',
        'Then the intended work. 52 ic_* integrity checkers were callable with the',
        'publishable key. Each takes a company id, bypasses row-level security and',
        'reports that company''s negative stock, unbalanced journals, payment double',
        'allocations and credit integrity. Less severe than a balance sheet, still',
        'another company''s books handed to an anonymous caller. 104 open readers',
        'down to 52.',
        '',
        'Two ic_* functions kept anon deliberately: ic_user_can_access_legal_entity',
        'and ic_user_can_access_consolidation_group are referenced inside RLS policy',
        'expressions, where revoking anon breaks row-level security instead of',
        'tightening it. The pg_policy filter found them without being told.',
        '',
        'Verified end to end rather than by inspection: run_all_integrity_checks',
        'still runs after closing 52 functions it calls, zero ic_* lost access for',
        'authenticated or service_role, the RLS helper and login lookup both still',
        'reachable by anon.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.763 pushed - dashboard readable again, 52 checkers closed" -ForegroundColor Green
}
