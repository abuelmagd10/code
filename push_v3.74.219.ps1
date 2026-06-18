$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.218.ps1") { Remove-Item -LiteralPath "push_v3.74.218.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.219"') {
    Write-Host "+ 3.74.219" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/sales-invoice-payment-command.service.ts" -Raw
if ($svc -notmatch "paymentCurrency\?\:") {
    Write-Host "X service command type missing paymentCurrency" -ForegroundColor Red; exit 1
}
if ($svc -notmatch "p_payment_currency: context\.command\.paymentCurrency") {
    Write-Host "X service does not forward paymentCurrency to RPC" -ForegroundColor Red; exit 1
}
Write-Host "+ service forwards FX context to the RPC" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/invoices/[id]/record-payment/route.ts" -Raw
if ($api -notmatch "paymentCurrency: body\?\.paymentCurrency") {
    Write-Host "X API does not extract paymentCurrency" -ForegroundColor Red; exit 1
}
Write-Host "+ API accepts paymentCurrency + rate metadata" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "exchangeRateId: paymentFCAmount > 0") {
    Write-Host "X invoice dialog not sending exchangeRateId" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice payment dialog forwards rate selector metadata" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_219.txt"
    $msgLines = @(
        "fix(invoice-payment): v3.74.219 - end-to-end FX context for invoice payments",
        "",
        "Test case: branch accountant paid 0.10 USD at manual rate 55 on an",
        "EGP invoice. Expected payment row: amount=5.50, currency=USD,",
        "original_amount=0.10, rate=55, rate_source=manual, created_by=",
        "accountant. Reality: amount=5.50, currency=EGP, original_amount=",
        "NULL, rate=1, rate_source=api, created_by=NULL. The cash JE line",
        "on the USD bank account had NULL original_debit + NULL",
        "original_currency, so the bank ledger read '\$0.00 ≈ £5.50' for an",
        "entry that should have been \$0.10.",
        "",
        "Root cause: the FX context was sent by the dialog but dropped at",
        "every layer of the stack -",
        "  - API endpoint extracted only exchangeRate + originalCurrencyAmount",
        "  - Service used those two fields only for the FX gain/loss",
        "    adjustment journal and that branch was skipped for EGP invoices",
        "  - RPC process_invoice_payment_atomic_v2 had no FX parameters at",
        "    all - the payment row was inserted without currency_code,",
        "    exchange_rate, original_amount, rate_source, or created_by",
        "",
        "Fixes:",
        "  - process_invoice_payment_atomic_v2 grows five FX parameters",
        "    (p_payment_currency, p_exchange_rate, p_original_amount,",
        "    p_exchange_rate_id, p_rate_source). It persists them on the",
        "    payments row alongside created_by/created_by_user_id/approved_by",
        "    and auto-generates a reference_number when the caller didn't",
        "    supply one.",
        "  - auto_create_payment_journal trigger reads the FX context off",
        "    the just-inserted payment row and stamps original_debit/credit,",
        "    original_currency, exchange_rate_used, exchange_rate_id on",
        "    each JE line based on the line's account currency. The USD",
        "    bank account now sees \$0.10 native + EGP 5.50 base on the",
        "    same line.",
        "  - Service forwards paymentCurrency / exchangeRate /",
        "    originalCurrencyAmount / exchangeRateId / rateSource to the",
        "    RPC.",
        "  - API endpoint extracts paymentCurrency / exchangeRateId /",
        "    rateSource from the request body.",
        "  - Invoice dialog forwards selectedRateId + the rate's source",
        "    (manual/api) so the payment row records exactly which rate",
        "    the user picked.",
        "",
        "Data fix (one-off): payment 52367b0b + JE-000040 had been written",
        "with the old missing-FX shape. Manually backfilled currency_code,",
        "original_amount, exchange_rate, rate_source, exchange_rate_id,",
        "created_by, reference_number on the payment row plus original_debit,",
        "original_currency, exchange_rate_used, exchange_rate_id on the JE",
        "lines. Recorded in audit_logs. Base-currency totals unchanged.",
        "",
        "Display: PaymentDetailsModal already reads currency_code +",
        "original_amount + created_by; the renderPaymentAmount helper on",
        "/payments already shows '0.10 \$ \\n ≈ 5.50 £' when",
        "original_currency differs from base. Both now work correctly for",
        "the fixed row and for every future cross-currency payment.",
        "",
        "  supabase/migrations/20260618000219_v3_74_219_fx_aware_invoice_payment.sql",
        "  lib/services/sales-invoice-payment-command.service.ts",
        "  app/api/invoices/[id]/record-payment/route.ts",
        "  app/invoices/[id]/page.tsx",
        "  lib/version.ts -> 3.74.219"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.219 pushed" -ForegroundColor Green
}
