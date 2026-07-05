$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.533"') {
    Write-Host "+ 3.74.533" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$cs = Get-Content -LiteralPath "lib/services/customer-payment-command.service.ts" -Raw
if ($cs -notmatch 'const paymentAmountBase = Number\(asNumber\(payment\.amount\) \* paymentFxRate\)') {
    Write-Host "X customer-payment: paymentAmountBase not set" -ForegroundColor Red; exit 1
}
if ($cs -notmatch 'toBase\(asNumber\(application\.amount_applied\)\)') {
    Write-Host "X customer-payment: per-invoice loop not converted" -ForegroundColor Red; exit 1
}
Write-Host "+ customer-payment posts in base currency" -ForegroundColor Green

$ss = Get-Content -LiteralPath "lib/services/supplier-payment-command.service.ts" -Raw
if ($ss -notmatch 'const paymentAmountBase') {
    Write-Host "X supplier-payment: paymentAmountBase missing (v3.74.532 regression)" -ForegroundColor Red; exit 1
}
Write-Host "+ supplier-payment fix still in place" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260705000533_v3_74_533_ias21_sales_side.sql" -Raw
if ($mig -notmatch 'fn_recalc_invoice_paid_status') {
    Write-Host "X migration missing fn_recalc_invoice_paid_status" -ForegroundColor Red; exit 1
}
if ($mig -notmatch 'p2\.amount \*') {
    Write-Host "X migration missing legacy fallback with FX conversion" -ForegroundColor Red; exit 1
}
Write-Host "+ migration has FX conversion + legacy fallback" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_533.txt"
    $msgLines = @(
        'fix(accounting): v3.74.533 - IAS 21 base currency on sales side (customer payments + invoices)',
        '',
        'Mirror of the v3.74.532 fix on the sales side. Audit confirmed',
        'three related bugs:',
        '',
        'A. fn_recalc_invoice_paid_status summed pa.allocated_amount',
        '   raw with no FX conversion, no legacy payments.invoice_id',
        '   fallback, and compared against total_amount without',
        '   subtracting returned_amount. A 100 USD payment @ 49.28',
        '   would land 100 into an EGP invoice.paid_amount.',
        '',
        'B. customer-payment-command.service.ts finalizeApprovedPayment',
        '   built JE lines with asNumber(payment.amount) and',
        '   asNumber(application.amount_applied) directly - same class',
        '   of bug the supplier service had before v3.74.532.',
        '',
        'C. v3.74.532 rerouted sync_document_paid_amount to delegate',
        '   to fn_recalc_invoice_paid_status when it exists. That made',
        '   the invoice branch USE the buggy function - a temporary',
        '   regression closed here.',
        '',
        'Fixes:',
        '',
        '  fn_recalc_invoice_paid_status is now a direct port of',
        '  fn_recalc_bill_paid_status: converts each allocation to',
        '  invoice currency via payment.exchange_rate / invoice.',
        '  exchange_rate, walks both payment_allocations and legacy',
        '  direct-link payments (NOT EXISTS anti-join), and picks the',
        '  terminal paid status against net_owed = total - returned.',
        '',
        '  customer-payment-command.service.ts computes paymentFxRate,',
        '  paymentAmountBase, and toBase() helper - both the main',
        '  advance JE and the per-invoice loop now use them.',
        '',
        'No data patch needed - the sales side hasn t posted an FX',
        'customer payment in the test dataset yet. Any future one will',
        'be correct.',
        '',
        'Files',
        '  lib/services/customer-payment-command.service.ts',
        '  supabase/migrations/20260705000533_...sql',
        '  lib/version.ts -> 3.74.533'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.533 pushed - sales side IAS 21 compliant" -ForegroundColor Green
}
