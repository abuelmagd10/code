$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.101.ps1") { Remove-Item -LiteralPath "push_v3.74.101.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.102"') { Write-Host "+ APP_VERSION = 3.74.102" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.102" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(payments): v3.74.102 - credit application creates payment row + refund UX

When a customer credit is applied to an invoice, the DB function
apply_customer_credit_to_invoice now inserts a row into payments
with payment_method='customer_credit'. This unifies the cash, bank,
and credit application views on /payments - the user no longer has
to open the invoice page to see how it was paid.

DB:
- v3_74_102_credit_application_creates_payment migration extends
  apply_customer_credit_to_invoice to INSERT a payment row tied to
  the journal entry, customer_credit account, invoice, and branch
- Backfilled the missing payment row for VitaSlims INV-00005 (£5)

UI (app/payments/page.tsx):
- v3.74.101 - Refund payments (amount<0) render 'Credit refund'
  badge; Apply/Edit/Delete buttons hidden to protect governance
- v3.74.101 - 'Linked invoice' cell shows 'Credit refund' instead
  of 'Not linked' for negative payments

DB migrations applied to live DB. No data migration needed for
existing companies - future credit applications auto-create rows." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.102 pushed" -ForegroundColor Green
}
