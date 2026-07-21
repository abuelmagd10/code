$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.773.ps1") { Remove-Item -LiteralPath "push_v3.74.773.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.774"') {
    Write-Host "+ 3.74.774" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.774]")) { Write-Host "X CHANGELOG missing [3.74.774]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260721000001_v3_74_774_trace_booking_custody_out.sql"
if (-not (Test-Path $mig)) { Write-Host "X missing migration: $mig" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# --- the change itself --------------------------------------------------------
if ($m -notmatch "create_financial_operation_trace") {
    Write-Host "X the migration does not create a trace" -ForegroundColor Red; exit 1
}
foreach ($link in @("booking_stock_withdrawal", "inventory_transaction", "journal_entry")) {
    if ($m -notmatch ("link_financial_operation_trace[\s\S]{0,200}" + $link)) {
        Write-Host "X the trace does not link $link - the operation would be half-recorded" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ trace created and linked to withdrawal, stock movement and journal entry" -ForegroundColor Green

# --- everything the posting already guaranteed must survive -------------------
# This function moves real stock and posts to the ledger. A refactor that
# quietly drops one of these is the exact failure this whole session is about.
$mustKeep = @{
    "assert_company_access_by_row" = "the company guard from v3.74.749"
    "calculate_fifo_cost"          = "FIFO valuation from v3.74.703"
    "CUSTODY_OUT_UNVALUED"         = "the warning when stock moves without a cost basis"
    "CUSTODY_OUT_JE_FAILED"        = "the hard failure when the journal entry is rejected"
    "SECURITY DEFINER"             = "the security context"
}
foreach ($k in $mustKeep.Keys) {
    if ($m -notmatch [regex]::Escape($k)) {
        Write-Host "X the migration dropped $k — $($mustKeep[$k])" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ FIFO valuation, company guard and both failure paths preserved" -ForegroundColor Green

# --- tracing must never be able to stop the physical operation ----------------
# Both trace blocks are wrapped. If an audit write fails, the stock still moves.
$wrapped = ([regex]::Matches($m, "EXCEPTION WHEN OTHERS THEN[\s\S]{0,220}TRACE")).Count
if ($wrapped -lt 2) {
    Write-Host "X trace calls must be wrapped so an audit failure cannot block the movement" -ForegroundColor Red
    Write-Host "  found $wrapped guarded block(s), expected 2" -ForegroundColor Red
    exit 1
}
Write-Host "+ both trace blocks wrapped - an audit failure cannot block the stock" -ForegroundColor Green

# --- the honest-actor decision must stay ---------------------------------------
if ($m -notmatch "auto_approved_no_store_manager") {
    Write-Host "X the auto-approve case must stay flagged rather than given a fake actor" -ForegroundColor Red
    exit 1
}
Write-Host "+ auto-approve path records NULL actor with a flag, not an invented one" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" $mig "push_v3.74.774.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.773.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_774.txt"
    $msgLines = @(
        'feat(audit): v3.74.774 - booking custody-out now records who did it',
        '',
        'Moving stock from the warehouse into a technician''s hands left no record of',
        'who authorised it. "Who took these materials, when, and under whose',
        'approval" had no answer in the data. The whole operation is now tied to one',
        'trace: the booking, the withdrawal request, the stock movement and the',
        'journal entry.',
        '',
        'The trace is written inside the posting function, not in its callers.',
        'fn_post_booking_custody_out is reached from the store-manager decision path',
        'and from an auto-approve path that fires when a branch has no store',
        'manager. Tracing at the posting site covers every caller including ones',
        'added later. The alternative - tracing at each caller - depends on finding',
        'all the callers correctly, and this session has shown repeatedly that that',
        'is exactly where I make mistakes.',
        '',
        'The actor is auth.uid(), and on the auto-approve path it is genuinely NULL:',
        'no human decided. It records NULL and flags the trace',
        'auto_approved_no_store_manager. An audit trail that invents an actor is',
        'worse than one that admits there was not one.',
        '',
        'Every trace call is wrapped. If the audit write fails, the stock movement',
        'and the journal entry still happen and a WARNING is raised. An audit trail',
        'that can block a physical operation is a worse problem than a missing audit',
        'row - the technician is standing there holding the part.',
        '',
        'This is the first change in this project rehearsed against a real copy of',
        'production before being applied to it. Run on the test database with a',
        'synthetic withdrawal: ok=true, valued=true, one stock row added, four links',
        'created. The test database exists because of the backup work in .768-.772;',
        'this is its second return within a day.',
        '',
        'Verified after applying to production and unchanged: FIFO valuation from',
        'v3.74.703, the company guard from v3.74.749, SECURITY DEFINER, both',
        'callers, and no anon access.',
        '',
        'The 6 historical untraced custody entries are deliberately not backfilled.',
        'A trace records who performed an operation; manufacturing one for a past',
        'event would be a lie in the audit trail. They remain visible as findings.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.774 pushed" -ForegroundColor Green
}
