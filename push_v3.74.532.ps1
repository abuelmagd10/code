$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.532"') {
    Write-Host "+ 3.74.532" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/supplier-payment-command.service.ts" -Raw
if ($svc -notmatch 'const paymentAmountBase') {
    Write-Host "X finalizeApprovedPayment not using paymentAmountBase" -ForegroundColor Red; exit 1
}
if ($svc -notmatch 'toBase\(asNumber\(allocation\.allocated_amount\)\)') {
    Write-Host "X per-bill loop not converting allocation to base" -ForegroundColor Red; exit 1
}
Write-Host "+ finalizeApprovedPayment posts in base currency" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260705000532_v3_74_532_ias21_base_currency_payments.sql" -Raw
if ($mig -notmatch 'PERFORM public\.fn_recalc_bill_paid_status') {
    Write-Host "X migration missing fn_recalc_bill_paid_status delegate" -ForegroundColor Red; exit 1
}
Write-Host "+ sync_document_paid_amount delegates to recalc functions" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_532.txt"
    $msgLines = @(
        'fix(accounting): v3.74.532 - IAS 21 base currency on supplier payment JE and paid_amount',
        '',
        'BILL-0001s 0.10 USD payment (@ 49.28 = 4.93 EGP) approval',
        'landed with Dr AP 0.10 / Cr Cash 0.10 in EGP accounts, and',
        'bill.paid_amount = 0.10 instead of 4.93. Two root causes:',
        '',
        '1. sync_document_paid_amount trigger summed raw p.amount into',
        '   bill.paid_amount with no FX conversion, and only via the',
        '   legacy payments.bill_id column (missing payment_allocations).',
        '   Rewritten as a thin wrapper that delegates to',
        '   fn_recalc_bill_paid_status (which already handles FX +',
        '   allocations correctly). Invoice branch left as-is on purpose',
        '   pending its own test cycle.',
        '',
        '2. Node finalizeApprovedPayment used asNumber(payment.amount)',
        '   and asNumber(allocation.allocated_amount) directly for JE',
        '   lines. Now computes paymentFxRate from payment.exchange_rate',
        '   with a toBase() helper, both the main advance JE and the',
        '   per-bill loop post in base currency.',
        '',
        'Corrective data patch already applied on prod: JE 40ffa1d0',
        'lines updated 0.10 -> 4.93, and fn_recalc_bill_paid_status',
        'called so BILL-0001 shows paid_amount 4.93 EGP, remaining 1.38.',
        '',
        'Files',
        '  lib/services/supplier-payment-command.service.ts',
        '  supabase/migrations/20260705000532_...sql',
        '  lib/version.ts -> 3.74.532'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.532 pushed - accounting posts in base currency" -ForegroundColor Green
}
