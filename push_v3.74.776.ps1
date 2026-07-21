$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.774.ps1") { Remove-Item -LiteralPath "push_v3.74.774.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.776"') {
    Write-Host "+ 3.74.776" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

# The pre-push hook is the authority on this, not my expectation of it. It
# requires a heading containing exactly "[<version>]" — the version in
# version.ts, alone. The first attempt used "[3.74.775 + 3.74.776]" to signal
# that two migrations ship together; my own check passed and the hook rejected
# the push after the commit had already been made.
#
# Forty-something mistakes into this work, this one has a clean name: I
# validated against what I intended rather than against the gate that decides.
# The check below now mirrors the hook exactly.
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("## [3.74.776]")) {
    Write-Host "X CHANGELOG needs a heading of the form: ## [3.74.776] - ..." -ForegroundColor Red
    Write-Host "  The pre-push hook requires the current version alone in the brackets." -ForegroundColor Yellow
    exit 1
}
Write-Host "+ CHANGELOG heading matches what the hook requires" -ForegroundColor Green

$migs = @{
    "supabase/migrations/20260721000002_v3_74_775_trace_booking_custody_return.sql" = "fn_post_booking_custody_return"
    "supabase/migrations/20260721000003_v3_74_776_trace_service_consumption_cogs.sql" = "fn_post_service_consumption_cogs"
}

foreach ($f in $migs.Keys) {
    if (-not (Test-Path $f)) { Write-Host "X missing migration: $f" -ForegroundColor Red; exit 1 }
    $m = Get-Content -LiteralPath $f -Raw
    $fn = $migs[$f]

    # The migration must carry a real definition, not just a description of one.
    # These files start as a comment header and have the body appended straight
    # from pg_get_functiondef; a header-only file would be a migration that
    # documents a change without containing it.
    if ($m -notmatch "CREATE OR REPLACE FUNCTION public\.$fn\(") {
        Write-Host "X $f has no definition for $fn" -ForegroundColor Red
        Write-Host "  node scripts/append-function-to-migration.js $f $fn" -ForegroundColor Yellow
        exit 1
    }
    if ($m -notmatch "create_financial_operation_trace") {
        Write-Host "X $fn is not traced in $f" -ForegroundColor Red; exit 1
    }
    # Tracing must never be able to stop the operation it observes.
    $wrapped = ([regex]::Matches($m, "EXCEPTION WHEN OTHERS")).Count
    if ($wrapped -lt 2) {
        Write-Host "X $fn needs both trace blocks wrapped, found $wrapped" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both migrations carry a real definition, traced, with wrapped trace blocks" -ForegroundColor Green

# What each function guaranteed before must still be guaranteed.
$ret = Get-Content -LiteralPath "supabase/migrations/20260721000002_v3_74_775_trace_booking_custody_return.sql" -Raw
foreach ($k in @("assert_company_access_by_row", "CUSTODY_RETURN_JE_FAILED", "nothing_out")) {
    if ($ret -notmatch [regex]::Escape($k)) {
        Write-Host "X custody return dropped $k" -ForegroundColor Red; exit 1
    }
}
$cogs = Get-Content -LiteralPath "supabase/migrations/20260721000003_v3_74_776_trace_service_consumption_cogs.sql" -Raw
foreach ($k in @("consume_fifo_lots", "SERVICE_CONSUMPTION_UNVALUED", "SERVICE_CONSUMPTION_COGS_FAILED", "journal_entry_id IS NULL")) {
    if ($cogs -notmatch [regex]::Escape($k)) {
        Write-Host "X service consumption dropped $k" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ FIFO consumption, batch idempotence and both failure paths preserved" -ForegroundColor Green

# The appender must refuse overloads - that failure mode has cost this project
# two releases already.
$app = Get-Content -LiteralPath "scripts/append-function-to-migration.js" -Raw
node --check "scripts/append-function-to-migration.js" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "X the appender does not parse" -ForegroundColor Red; exit 1 }
if ($app -notmatch "overloads — refusing to guess") {
    Write-Host "X the appender must refuse to guess between overloads" -ForegroundColor Red; exit 1
}
if ($app -notmatch "pg_get_functiondef") {
    Write-Host "X the appender must read the live definition, not a copy" -ForegroundColor Red; exit 1
}
Write-Host "+ appender reads live definitions and refuses overloads" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

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

git add -- "lib/version.ts" "CHANGELOG.md" `
    "supabase/migrations/20260721000002_v3_74_775_trace_booking_custody_return.sql" `
    "supabase/migrations/20260721000003_v3_74_776_trace_service_consumption_cogs.sql" `
    "scripts/append-function-to-migration.js" `
    "push_v3.74.776.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.774.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

# The first run committed successfully and was then blocked by the pre-push
# hook, so HEAD is already this release. Amend it rather than stacking a second
# commit whose only content is a fixed heading — the history should show the
# release, not my correction to it.
$headIsThisRelease = (git log -1 --pretty=%s) -match "v3\.74\.775\+776"
if ($headIsThisRelease -and $staged) {
    Write-Host "HEAD is already this release - amending rather than adding a commit." -ForegroundColor Cyan
    git commit --amend --no-edit 2>&1 | ForEach-Object { Write-Host $_ }
    $staged = $null
}

if (-not $staged) {
    Write-Host "Nothing further to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_776.txt"
    $msgLines = @(
        'feat(audit): v3.74.775+776 - custody return and service consumption traced',
        '',
        'Three of five paths in this family now record who performed them, each',
        'rehearsed against a copy of production before being applied to it.',
        '',
        'Custody return was tested as a FULL CYCLE - out, then back - because a',
        'return is meaningless in isolation: ok=true, value=16.114286, one stock',
        'row, four links.',
        '',
        'Service consumption has a different shape: it processes a BATCH of',
        'inventory rows and emits one journal entry keyed on the earliest. So the',
        'trace opens after the batch is identified rather than before the first',
        'write. FIFO consumption in the loop therefore precedes the trace, but every',
        'consumed row is linked, so the operation stays fully reconstructable.',
        'Opening earlier would have meant an idempotency key that cannot distinguish',
        'a resync top-up from the original posting - exactly the gap v3.74.705 was',
        'written to close. Correct linkage over tidy ordering, and the trade-off is',
        'in the migration rather than left for someone to rediscover.',
        '',
        'Two governance guards rejected the first rehearsal attempts: a',
        'cross-company cost centre, then a zero branch balance. Both correct. Retried',
        'against a product with 178 units on hand: cost 600.00, journal created, row',
        'stamped.',
        '',
        'New tool, append-function-to-migration.js. A migration is the record of',
        'what was applied; if I retype a 200-line PL/pgSQL body by hand the file',
        'records what I typed, not what is running. Those are the same thing only',
        'until they are not, and one transposed line in a function that posts to the',
        'ledger does not announce itself. The tool reads pg_get_functiondef, so the',
        'file cannot drift from production because it was never a copy. It refuses',
        'to run when a function has overloads - that failure mode has already cost',
        'this project two releases.',
        '',
        'Verified after applying, all three: SECURITY DEFINER intact, company guards',
        'intact, FIFO logic intact, both trace blocks wrapped in each, and no anon',
        'access.',
        '',
        'Remaining in this family: execute_payment_correction and',
        'execute_vendor_payment_correction, same pattern.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.776 pushed - 3 of 5 trace paths complete" -ForegroundColor Green
}
