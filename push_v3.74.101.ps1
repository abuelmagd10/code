$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.100.ps1") { Remove-Item -LiteralPath "push_v3.74.100.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.101"') { Write-Host "+ APP_VERSION = 3.74.101" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.101" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(accounting): v3.74.101 - customer refund missing ledger row

Symptom: After successfully refunding a customer credit from /customers,
the invoice detail page still showed 'Customer has an available credit
balance: 5.00' even though the customer had nothing left.

Root cause: CustomerRefundCommandService updated customer_credits.
used_amount but never wrote the disbursement row to customer_credit_
ledger. The invoice page reads the ledger-based balance from
/api/customer-credits/[id], which only sums ledger.amount. With no
refund row, the balance stayed at (+10 sales_return - 5 credit_applied)
= +5 forever.

Fix:
- DB migration v3_74_100_customer_refund_in_ledger:
  + Adds 'customer_refund' to customer_credit_ledger.source_type
    check constraint
  + Backfills the missing row for VitaSlims/محمد بسيونى
- lib/services/customer-refund-command.service.ts:
  + After applyCustomerCredits(), insert a -amount row into
    customer_credit_ledger with source_type='customer_refund'

Verified: customer 3c38d6e1 ledger sum is now 0 (was +5)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.101 pushed" -ForegroundColor Green
}
