$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.759.ps1") { Remove-Item -LiteralPath "push_v3.74.759.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.760"') {
    Write-Host "+ 3.74.760" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.760]")) { Write-Host "X CHANGELOG missing [3.74.760]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# --- The snapshot must no longer resurrect what v3.74.759 removed -------------
$fnSql = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
$scSql = Get-Content -LiteralPath "supabase/schema/schema.sql" -Raw
foreach ($fn in @("fix_all_historical_cogs", "fix_cogs_clean", "recalculate_cogs")) {
    if ($fnSql -match ("FUNCTION public\." + $fn + "\(")) {
        Write-Host "X $fn is still defined in functions.sql" -ForegroundColor Red; exit 1
    }
    if ($scSql -match ("FUNCTION public\." + $fn + "\(")) {
        Write-Host "X $fn still has grants in schema.sql" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the three dropped functions are gone from both snapshot files" -ForegroundColor Green

# The rate limiter's anon grant is load-bearing: throttling runs before login,
# and lib/rate-limit.ts fails OPEN on error. Losing this line during a snapshot
# edit would disable rate limiting at the login page and report nothing.
if ($scSql -notmatch "GRANT EXECUTE ON FUNCTION public\.check_and_increment_rate_limit\(.*TO anon;") {
    Write-Host "X the rate limiter lost its anon grant - login throttling would fail open" -ForegroundColor Red
    exit 1
}
Write-Host "+ rate limiter keeps its anon grant" -ForegroundColor Green

# Arithmetic that has to close. 1202 plain functions live in public (plus 4
# extension aggregates). The snapshot should hold all but ic_anon_reachable_writers,
# which was created after the last regeneration.
$defCount = ([regex]::Matches($fnSql, "(?m)^CREATE OR REPLACE FUNCTION public\.")).Count
if ($defCount -ne 1201) {
    Write-Host "X functions.sql holds $defCount definitions, expected 1201" -ForegroundColor Red
    Write-Host "  If this is a legitimate change, regenerate and update this number:" -ForegroundColor Yellow
    Write-Host "     node scripts/dump-db-functions.js ; node scripts/dump-db-schema.js" -ForegroundColor Yellow
    exit 1
}
Write-Host "+ 1201 definitions - the count closes against 1202 live" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
$snap = & node scripts/check-schema-snapshot-fresh.js 2>&1 | Out-String
$snapCode = $LASTEXITCODE
Write-Host ($snap.Trim())
if ($snapCode -ne 0) { Write-Host "X the snapshot describes something a migration removed" -ForegroundColor Red; exit 1 }

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "scripts/check-schema-snapshot-fresh.js" `
    "supabase/schema/functions.sql" `
    "supabase/schema/schema.sql" `
    "push_v3.74.760.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.759.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_760.txt"
    $msgLines = @(
        'fix(schema): v3.74.760 - the snapshot would have restored what .759 removed',
        '',
        'v3.74.759 dropped three anon-callable COGS rewriters from the database. The',
        'checked-in snapshot - the thing a rebuild restores from - still carried:',
        '',
        '  GRANT EXECUTE ON FUNCTION public.fix_all_historical_cogs() TO anon;',
        '  GRANT EXECUTE ON FUNCTION public.fix_cogs_clean()          TO anon;',
        '  GRANT EXECUTE ON FUNCTION public.recalculate_cogs()        TO anon;',
        '',
        'Rebuilding from this repository would have recreated all three, grants and',
        'all, an hour after removing them. A stale mirror is worse than no mirror',
        'because it is trusted. Removed from both files along with 13 anon grants;',
        'the rate limiter keeps its own, which is load-bearing. 1201 definitions in',
        'the snapshot plus ic_anon_reachable_writers equals 1202 live: the count',
        'closes, so the surgical edit took the three and nothing else.',
        '',
        'check-schema-snapshot-fresh.js fails the build if the snapshot describes',
        'anything a migration removed. Offline, so it runs in CI.',
        '',
        'Three defects in that checker, all mine, all caught before shipping:',
        '',
        '1. I applied every CREATE in a migration file and then every DROP, which is',
        '   not what the file does. The commonest migration here drops one overload',
        '   and creates another; verb-order processing read that as a deletion. Eight',
        '   functions reported as stale. I queried the database: all eight were live.',
        '   Believing my own output would have meant deleting eight working functions',
        '   from the backup. Fixed by interleaving on match position.',
        '',
        '2. Even ordered, it matched names rather than signatures, so a dropped',
        '   overload and a surviving one were indistinguishable. Now name + arity,',
        '   counted at paren depth 1.',
        '',
        '3. The last remaining hit, create_product_atomic/16, is also live. That one',
        '   is not a bug but the ceiling: 49 of 661 applied migration versions have a',
        '   file in the folder, the rest went through the SQL editor. A function can',
        '   be dropped by a file and recreated by a migration this script cannot see.',
        '   Recorded as an exception with the live evidence attached, not muted.',
        '',
        'Same lesson as the twenty-two before it. A name is not an identity, order is',
        'not a set, and a check that has never been watched fail is not a check.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.760 pushed - the backup no longer restores what we removed" -ForegroundColor Green
}
