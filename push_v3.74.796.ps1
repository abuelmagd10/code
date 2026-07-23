$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.795.ps1") { Remove-Item -LiteralPath "push_v3.74.795.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.796"') {
    Write-Host "+ 3.74.796" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.796]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.796]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the corrected tax formula, positively asserted -----------------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000003_v3_74_796_tax_checker_learns_the_real_formula.sql" -Raw
foreach ($must in @(
    "WHEN i2.tax_inclusive",
    "discount_position,'') = 'before_tax'",
    "COALESCE(i.shipping,0) * COALESCE(i.shipping_tax_rate,0)/100.0",
    "backfilled shipping_tax_rate"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X tax-checker migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ tax checker understands inclusive pricing, discounts and shipping tax" -ForegroundColor Green

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
    "supabase/migrations/20260723000003_v3_74_796_tax_checker_learns_the_real_formula.sql" `
    "push_v3.74.796.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.795.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_796.txt"
    $msgLines = @(
        'fix(integrity): v3.74.796 - a clean integrity board for the first time',
        '',
        'Handover session, executed after a verified OneDrive backup:',
        '',
        '- ic_tax_accuracy compared stored tax to qty*price*rate - blind to',
        '  line discounts, tax-INCLUSIVE pricing, the before-tax document',
        '  discount, and shipping tax (the owner''s rule). Every CORRECT',
        '  invoice carrying any of those looked wrong - the 8.11/11.2',
        '  dashboard false positives. The formula now understands all four.',
        '- Data companion: exactly TWO historical invoices system-wide had 14%',
        '  shipping tax inside their totals from before shipping_tax_rate was',
        '  persisted (both imply exactly 14.0%) - backfilled.',
        '- BKG-2026-00006 cancelled per the owner''s decision: custody already',
        '  returned, custody GL at zero; the completed->cancelled transition',
        '  is rightly forbidden by the state machine, so the fix ran under a',
        '  documented trigger bypass with a manual status-history row.',
        '- FIFO reconciliation: QUANTITIES clean 100% across all companies;',
        '  the value drift shrank from -5.41 to -0.14 (rounding residue inside',
        '  the valuation checker''s healthy tolerance). Closed.',
        '- The purchases dispatch-notification twin was audited and found',
        '  already immune (per-round trace id in its event keys). No change.',
        '',
        'Verified: zero false positives on every real invoice on both DBs; a',
        'deliberately corrupted invoice IS caught (diff 95.65); on prod all',
        'three checkers (tax, valuation, bookings) report ZERO findings.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.796 pushed - the integrity board is clean and it means it" -ForegroundColor Green
}
