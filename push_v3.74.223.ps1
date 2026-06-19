$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.222.ps1") { Remove-Item -LiteralPath "push_v3.74.222.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.223"') {
    Write-Host "+ 3.74.223" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -notmatch "applyCustomerCredits\(command\.companyId, command\.customerId, command\.baseAmount") {
    Write-Host "X applyCustomerCredits still passes refund-ccy amount" -ForegroundColor Red; exit 1
}
if ($svc -notmatch "amount: -Math\.abs\(Number\(command\.baseAmount") {
    Write-Host "X ledger insert still uses refund-ccy amount" -ForegroundColor Red; exit 1
}
Write-Host "+ refund service now deducts in base currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_223.txt"
    $msgLines = @(
        "fix(customer-refund): v3.74.223 - cross-currency refunds were deducting USD value from EGP credit",
        "",
        "Reported via integrity check + bank ledger: customer had 0.67 EGP",
        "credit, accountant refunded 0.01 USD at manual rate 55, the GL",
        "correctly debited 0.55 EGP from account 2155, but customer_credits.",
        "used_amount was set to 0.01 instead of 0.55. The 0.54 EGP gap was",
        "the integrity check's 'customer_credits without matching journal'",
        "deviation, and the customer page showed Available 0.67 / Disbursed",
        "0.01 instead of Available 0.13 / Disbursed 0.55.",
        "",
        "Cause: CustomerRefundCommandService.recordRefund passed",
        "command.amount (refund-currency, e.g. 0.01 USD) to both",
        "applyCustomerCredits and customer_credit_ledger. Both tables are",
        "denominated in BASE currency, so the deduction needs to be",
        "command.baseAmount (0.55 EGP).",
        "",
        "Fix: pass command.baseAmount to applyCustomerCredits + the ledger",
        "insert. Same-currency refunds are unaffected (amount == baseAmount",
        "when refundCurrency = baseCurrency).",
        "",
        "Data fix: customer_credits row for ahmed abuelmagd / credit",
        "ee7447a0 backfilled used_amount 0.01 -> 0.55, and the matching",
        "customer_credit_ledger row 433cb3ad amount -0.01 -> -0.55. Recorded",
        "in audit_logs. ic_customer_credit now returns clean. Customer",
        "page will show Available 0.13 / Disbursed 0.55.",
        "",
        "  lib/services/customer-refund-command.service.ts",
        "  lib/version.ts -> 3.74.223"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.223 pushed" -ForegroundColor Green
}
