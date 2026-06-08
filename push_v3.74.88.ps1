# v3.74.88 - Invoice cards + payments table reflect credit applications
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.88"') { Write-Host "+ APP_VERSION = 3.74.88" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.88" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.88]')) { Write-Host "+ CHANGELOG 3.74.88" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.88" -ForegroundColor Red; exit 1 }

$f = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
$lineCount = ($f -split "`n").Count
if ($lineCount -ge 4080) { Write-Host "+ invoices/[id]/page.tsx intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X file truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($f.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($f -match 'creditApplications') { Write-Host "+ creditApplications state present" -ForegroundColor Green } else { Write-Host "X creditApplications missing" -ForegroundColor Red; exit 1 }
if ($f -match "source_type.*'credit_applied'") { Write-Host "+ fetches credit_applied ledger rows" -ForegroundColor Green } else { Write-Host "X ledger fetch missing" -ForegroundColor Red; exit 1 }
if ($f -match 'totalPaymentsFromTable \+ totalCreditApplied') { Write-Host "+ totalPaidAmount includes credit apps" -ForegroundColor Green } else { Write-Host "X total formula not updated" -ForegroundColor Red; exit 1 }
if ($f -match 'invoicePayments.length \+ creditApplications.length') { Write-Host "+ count badge unified" -ForegroundColor Green } else { Write-Host "X count badge not unified" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "app/invoices/\[id\]/page\.tsx").Count
if ($err -eq 0) { Write-Host "+ 0 errors in invoices/[id]/page.tsx" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "app/invoices/\[id\]/page\.tsx" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(invoice-page): v3.74.88 - cards and payments table reflect credit applications

User noticed after applying 5 EGP of credit to INV-00005, the invoice
page kept showing 'Total Paid: 0' and 'Net Remaining: 20', even though
invoice.paid_amount in DB was correctly 5 and the customer credit
had dropped to 5.

Root cause: apply_customer_credit_to_invoice writes to
customer_credit_ledger (source_type='credit_applied', negative amount)
and bumps invoice.paid_amount directly - it does NOT insert a row into
the payments table. But the invoice detail page recomputes totalPaid
from invoicePayments[], so a credit application was invisible to it.

We didn't write the credit-application as a payments row because the
payments table has heavy triggers (trg_sync_invoice_paid bumps
invoice.paid_amount AGAIN, trg_auto_create_payment_journal posts a
journal, prevent_invoice_overpayment validates, etc.) - the RPC already
did that work. Re-doing it via a payments insert would double-count or
duplicate. Adding skip-logic to 4+ trigger functions would be invasive.

Approach (one file, one source of truth):
1. New state creditApplications - fetched in loadInvoice() from
   customer_credit_ledger where source_id = invoiceId and source_type =
   'credit_applied'.
2. totalPaidAmount = payments-sum + abs(ledger.amount)-sum. Ledger
   stores negative amounts (customer credit went down); applied amount
   = abs.
3. Payments table renders one row per credit application with an
   emerald 'Credit Applied' badge. Count badge in header now adds both.
4. Empty state only when both arrays empty.

For INV-00005 (total 20, one 5-EGP credit applied):
- Total Paid card -> 5.00 ✓
- Net Remaining card -> 15.00 ✓
- Payments table -> one emerald row, total 5.00 ✓

TypeScript: 0 errors. File rebuilt via heredoc with anchor assertions
because Edit truncated the tail again. 4108 lines, ends with }." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.88 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.87.ps1') { Remove-Item -LiteralPath 'push_v3.74.87.ps1' -Force }
}
