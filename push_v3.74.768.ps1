$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.767.ps1") { Remove-Item -LiteralPath "push_v3.74.767.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.768"') {
    Write-Host "+ 3.74.768" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.768]")) { Write-Host "X CHANGELOG missing [3.74.768]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$fnSql = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
$scSql = Get-Content -LiteralPath "supabase/schema/schema.sql" -Raw

# Nothing dropped today may reappear. v3.74.760 exists because the snapshot
# still carried these, grants and all, an hour after they were removed.
foreach ($fn in @("fix_all_historical_cogs","fix_cogs_clean","recalculate_cogs","fix_historical_cogs")) {
    if ($fnSql -match ("FUNCTION public\." + $fn + "\(")) {
        Write-Host "X $fn is back in functions.sql" -ForegroundColor Red; exit 1
    }
    if ($scSql -match ("FUNCTION public\." + $fn + "\(")) {
        Write-Host "X $fn still has grants in schema.sql" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the four COGS rewriters are absent from both files" -ForegroundColor Green

# Everything built today must be captured, or a rebuild loses the guards.
foreach ($fn in @("ic_anon_reachable_writers","ic_anon_reachable_readers","get_db_governance_state")) {
    if ($fnSql -notmatch ("FUNCTION public\." + $fn + "\(")) {
        Write-Host "X $fn is missing from the snapshot - a rebuild would lose it" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ all three new guards captured" -ForegroundColor Green

# The revokes must be reflected. pg_get_functiondef omits ACLs, so schema.sql is
# the ONLY place grants live - if it is stale, a rebuild restores anon access.
foreach ($fn in @("get_balance_sheet","get_income_statement","get_trial_balance",
                  "unlock_accounting_period","approve_supplier_payment_atomic")) {
    if ($scSql -match ("GRANT EXECUTE ON FUNCTION public\." + $fn + "\([^)]*\) TO anon;")) {
        Write-Host "X schema.sql still grants $fn to anon - a rebuild reopens it" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no revoked function still granted to anon" -ForegroundColor Green

# And the deliberate exceptions must survive. Losing the rate limiter's grant
# would disable login throttling; losing the RLS helper breaks row security.
foreach ($fn in @("check_and_increment_rate_limit","find_user_by_login","can_access_invoice_items")) {
    if ($scSql -notmatch ("GRANT EXECUTE ON FUNCTION public\." + $fn + "\([^)]*\) TO anon;")) {
        Write-Host "X $fn lost its anon grant in the snapshot - it is load-bearing" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ the three deliberate anon grants survived" -ForegroundColor Green

# Parity with the live database. 1204 functions live, 1204 definitions here.
# The dump script prints "1214 routines" from its own counter; the reference
# number is pg_proc, and that is what this compares against.
$defCount = ([regex]::Matches($fnSql, "(?m)^CREATE OR REPLACE FUNCTION public\.")).Count
if ($defCount -ne 1204) {
    Write-Host "X functions.sql holds $defCount definitions, expected 1204" -ForegroundColor Red
    Write-Host "  Regenerate, then update this number:" -ForegroundColor Yellow
    Write-Host "     node scripts/dump-db-functions.js ; node scripts/dump-db-schema.js" -ForegroundColor Yellow
    exit 1
}
Write-Host "+ 1204 definitions - exact parity with the live database" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
$snap = & node scripts/check-schema-snapshot-fresh.js 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Host ($snap.Trim()) ; Write-Host "X snapshot describes something a migration removed" -ForegroundColor Red; exit 1 }
Write-Host ($snap.Trim())

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

git add -- "lib/version.ts" "CHANGELOG.md" `
    "supabase/schema/functions.sql" "supabase/schema/schema.sql" `
    "push_v3.74.768.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.767.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_768.txt"
    $msgLines = @(
        'chore(schema): v3.74.768 - snapshot regenerated, exact parity with production',
        '',
        'Twenty database changes shipped today across twenty-two migrations. The',
        'checked-in snapshot - the thing a disaster rebuild restores from - knew',
        'about none of them.',
        '',
        'v3.74.760 exists because a stale snapshot still carried three dangerous',
        'functions AND their anon grants an hour after they were dropped. That was',
        'repaired by hand, surgically. This replaces the hand-edit with a full',
        'regeneration from the live database.',
        '',
        'Parity closes exactly: 1204 functions live in pg_proc, 1204 CREATE',
        'definitions in functions.sql. First exact match today - v3.74.760 was 1201',
        'against 1202. The dump script prints "1214 routines" from its own counter;',
        'pg_proc is the reference and the push guard compares against that.',
        '',
        'Verified in both files rather than assumed:',
        '',
        '  absent   fix_all_historical_cogs, fix_cogs_clean, recalculate_cogs and',
        '           fix_historical_cogs - zero trace in either file',
        '  present  ic_anon_reachable_writers, ic_anon_reachable_readers,',
        '           get_db_governance_state - a rebuild keeps the guards',
        '  revoked  get_balance_sheet, get_income_statement, get_trial_balance,',
        '           unlock_accounting_period, approve_supplier_payment_atomic -',
        '           zero anon grants',
        '  kept     check_and_increment_rate_limit, find_user_by_login,',
        '           can_access_invoice_items - anon grants intact, all three are',
        '           load-bearing',
        '',
        'schema.sql matters more than it looks: pg_get_functiondef omits ACLs, so',
        'this file is the only place grants are recorded. A stale copy does not just',
        'lose information, it actively restores EXECUTE-to-anon on everything closed',
        'today.',
        '',
        'The freshness checker passes over 624 migration files: nothing in the',
        'snapshot describes an object a migration removed.',
        '',
        'Still true, and worth not overstating: this is a fidelity record, not a',
        'proven recovery plan. It has never been restored into a clean project. That',
        'test needs a separate database and is the owner''s call.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.768 pushed - the backup now matches what you actually have" -ForegroundColor Green
}
