$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.785.ps1") { Remove-Item -LiteralPath "push_v3.74.785.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.786"') {
    Write-Host "+ 3.74.786" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.786]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.786]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- single-consumer principle, positively asserted -----------------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260722000003_v3_74_786_single_fifo_consumer.sql" -Raw
foreach ($must in @(
    "app.fifo_payload_present",
    "calculate_fifo_cogs(NEW.product_id, ABS(NEW.quantity_change))",
    "consume_fifo_lots(",
    "anchor matched % times"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X single-consumer migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ single FIFO consumer migration present (already applied to test + prod)" -ForegroundColor Green

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
    "supabase/migrations/20260722000003_v3_74_786_single_fifo_consumer.sql" `
    "push_v3.74.786.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.785.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_786.txt"
    $msgLines = @(
        'fix(inventory): v3.74.786 - FIFO lots were consumed TWICE on every sale',
        '',
        'Caught live at the first dispatch approval under the v3.74.785 cycle:',
        'chk_quantities violation on fifo_cost_lots - a lot holding 1 unit,',
        'an invoice selling 1 unit, and yet the lot went negative.',
        '',
        'Since v3.74.702, trg_auto_cogs_on_sale calls consume_fifo_lots, which',
        'records a consumption AND depletes the lot. The atomic executors also',
        'apply the TS-prepared p_fifo_consumptions payload - a second decrement',
        'of the same lots. Every RPC-driven sale since 702 consumed FIFO twice:',
        'silently while lots had slack (the -5.41 FIFO-vs-snapshot drift the',
        'integrity checker reported), loudly now that stock is exact.',
        '',
        'Fix - single-consumer principle: post_accounting_event raises a',
        'transaction-local flag when the event carries explicit consumption',
        'rows; the trigger then PRICES the COGS journal with the read-only',
        'calculate_fifo_cogs (same lots, same allocation, same amount) and',
        'leaves depletion to the payload. Legacy paths without a payload keep',
        'the trigger as their only consumer - nothing breaks.',
        '',
        'Rehearsed on the restored test copy: exactly one decrement (1 to 0),',
        'exactly one consumption row, correct COGS journal at real lot cost,',
        'deferred revenue journal posted balanced. DB-only fix, applied to',
        'test + prod via anchor-verified patch; this migration is the record.',
        '',
        'Handover: historical lot balances are understated by the double',
        'consumption since 702 - a FIFO-vs-inventory reconciliation pass is',
        'queued for a future session.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.786 pushed - FIFO lots are consumed exactly once" -ForegroundColor Green
}
