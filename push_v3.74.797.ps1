$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.796.ps1") { Remove-Item -LiteralPath "push_v3.74.796.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.797"') {
    Write-Host "+ 3.74.797" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.797]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.797]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the custody lifecycle seal, positively asserted ----------------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000004_v3_74_797_custody_lifecycle_sealed.sql" -Raw
foreach ($must in @(
    "fn_void_pending_booking_withdrawals",
    "WITHDRAWAL_BOOKING_FINISHED",
    "b.status IN ('draft','confirmed','in_progress')",
    "completion anchor matched % times"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X custody lifecycle migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ pending withdrawals die with the booking; stale approvals are refused" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
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
    "supabase/migrations/20260723000004_v3_74_797_custody_lifecycle_sealed.sql" `
    "push_v3.74.797.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.796.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_797.txt"
    $msgLines = @(
        'fix(bookings): v3.74.797 - the custody lifecycle is sealed (3.8c closed)',
        '',
        'The comprehensive review of the booking<->invoice gap found the',
        'designed protocol SOUND: custody returns at completion so consumption',
        'deducts exactly once; cancellation requests custody returns; sold-',
        'product edits already resync onto the draft invoice with full',
        'notifications (resync_booking_invoice, wired via the extra/bundle',
        'RPCs).',
        '',
        'The real holes - the BKG-2026-00006 story verbatim:',
        '1. complete_booking_atomic left still-PENDING withdrawal requests',
        '   alive.',
        '2. cancel_booking_atomic did too.',
        '3. decide_booking_stock_withdrawal had no booking-state guard, so a',
        '   stale request approved AFTER completion moved stock into a custody',
        '   nothing would ever consume or return - and the invoice "did not',
        '   read it" because there was rightly nothing left to read.',
        '',
        'Fixes: fn_void_pending_booking_withdrawals (auto-reject with an',
        'explanatory note + requester notification) called by completion AND',
        'cancellation; and an approve-guard in decide (rejecting stale',
        'requests stays allowed).',
        '',
        'Rehearsed end-to-end on the test copy (after aligning its legacy',
        'accrual triggers to prod''s disabled state): completion voids the',
        'pending request AND still births the invoice; a stale approve is',
        'blocked with the Arabic message while a stale reject succeeds;',
        'cancellation voids the pending request. DB-only release, applied to',
        'test + prod.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.797 pushed - custody in, custody out, nothing stranded in between" -ForegroundColor Green
}
