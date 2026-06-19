$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.224.ps1") { Remove-Item -LiteralPath "push_v3.74.224.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.225"') {
    Write-Host "+ 3.74.225" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: customer-refund service must persist FX context on the payment row
$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -notmatch "base_currency_amount:\s*-baseAmt" -or $svc -notmatch "original_currency:\s*ccy") {
    Write-Host "X refund service missing FX persistence" -ForegroundColor Red; exit 1
}
Write-Host "+ refund service persists FX context (amount/base/original/currency/rate)" -ForegroundColor Green

# Guard 2: payments page must surface FC even for negative (refund) amounts
$pay = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($pay -notmatch "Math\.abs\(origAmt\) > 0") {
    Write-Host "X payments page still uses 'origAmt > 0' (hides FC on refunds)" -ForegroundColor Red; exit 1
}
Write-Host "+ payments page detects FC on refund rows (Math.abs origAmt)" -ForegroundColor Green

# Guard 3: banking detail tfoot must render native totals for FC accounts
$bank = Get-Content -LiteralPath "app/banking/[id]/page.tsx" -Raw
if ($bank -notmatch "nativeDebitTotal" -or $bank -notmatch "nativeBalanceTotal") {
    Write-Host "X bank account tfoot missing native-currency totals" -ForegroundColor Red; exit 1
}
Write-Host "+ bank account tfoot renders native USD totals alongside EGP" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_225.txt"
    $msgLines = @(
        "fix(refund-display, banking-totals): v3.74.225 - cross-currency refund UX",
        "",
        "Two observations from the 0.01 USD refund test on a 0.55 EGP credit:",
        "",
        "Observation 1 - payments list showed '-0.01 £' instead of '0.01 $ / EGP eq'",
        "  Root cause: refund service inserted only amount/currency_code on the",
        "  payments row, never base_currency_amount / original_amount / original_",
        "  currency. The /payments renderer needs those three to switch to the",
        "  'native (base equivalent)' two-line format used by v3.74.219.",
        "  Fix in lib/services/customer-refund-command.service.ts -",
        "  insertRefundPayment now accepts and writes the full FX payload",
        "  (base_currency_amount, original_amount, original_currency,",
        "  exchange_rate, exchange_rate_used, exchange_rate_id, rate_source).",
        "  Caller passes command.baseAmount + refundCurrency + exchangeRate.",
        "",
        "  Also in app/payments/page.tsx - the isFC guard used 'origAmt > 0'",
        "  which evaluates false for refunds (negative amounts). Switched to",
        "  'Math.abs(origAmt) > 0' so refund rows also surface FX context.",
        "",
        "Observation 2 - bank account 1010 (USD) detail page totals row showed",
        "  only EGP equivalents (15.50 / 10.55 / 4.95 £) while every row above",
        "  already showed native + base. Now the tfoot mirrors the row format:",
        "    Debit:   0.30 $ / ~ 15.50 £",
        "    Credit:  0.21 $ / ~ 10.55 £",
        "    Balance: 0.09 $ / ~  4.95 £",
        "  Base-currency accounts (EGP) continue to show a single EGP total.",
        "",
        "Backfill: payment 8cbd4b30 (REF-1781864634620) had its FX columns",
        "set to match JE-000041 (USD, rate 55, base -0.55, original -0.01).",
        "ic_customer_credit / ic_fx_amount_accuracy / ic_payment_no_journal",
        "all clean after backfill.",
        "",
        "  lib/services/customer-refund-command.service.ts",
        "  app/payments/page.tsx",
        "  app/banking/[id]/page.tsx",
        "  lib/version.ts -> 3.74.225"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.225 pushed" -ForegroundColor Green
}
