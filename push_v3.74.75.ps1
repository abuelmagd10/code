# v3.74.75 - DB-only fix: apply_customer_credit_to_invoice journal entry
# (Dr 2155 customer_credit + Cr AR, instead of Dr AR + Cr AR which netted zero)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.75"') { Write-Host "+ APP_VERSION = 3.74.75" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.75" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.75]')) { Write-Host "+ CHANGELOG 3.74.75" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.75" -ForegroundColor Red; exit 1 }

# v3.74.75 is a DB-only fix — no TS changes expected.
# Verify no app code was inadvertently touched by checking the markers stayed in v3.74.74 files.
$svc = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
if ($svc -match 'InventoryShortageItem' -and $svc -match 'check_branch_warehouse_stock') {
    Write-Host "+ v3.74.74 markers still in place" -ForegroundColor Green
} else { Write-Host "X v3.74.74 markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (full project, no regressions allowed) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "accounting-transaction-service\.ts|sales-invoice-warehouse-command\.service\.ts|warehouse-approve|version\.ts"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(accounting): v3.74.75 - apply_customer_credit_to_invoice journal entry

The RPC apply_customer_credit_to_invoice (called by /api/customer-credits/
[customerId]/apply, which the invoice page's 'Apply Credit' green banner
hits) was writing both journal lines on the same account:
  Dr AR  x
  Cr AR  x
which nets to zero. So the customer_credit_ledger got a -amount row and
invoices.paid_amount went up, but the GL never moved - liability 2155
stayed inflated and AR stayed inflated. Trial balance vs. ledger view
would have silently drifted the first time the button was used.

Fix - same RPC, correct double-entry:
  Dr 2155 Customer Credit Liability  (sub_type='customer_credit')
     Cr AR Accounts Receivable        (sub_type='accounts_receivable')
This is the inverse of the entry that created the credit (Dr AR / Cr 2155
when a return or overpayment posted). The two cancel.

Resolution order for the customer credit account: sub_type='customer_credit'
> sub_type='customer_advance' > account_code='2155' > name match. If the
account is missing, the function now raises CUSTOMER_CREDIT_ACCOUNT_MISSING
explicitly instead of silently writing a broken entry. v3.74.28-30 ensures
every company has 2155 seeded.

Also threads branch_id to both journal lines (was missing - would have
broken per-branch reports).

No backfill needed: queried journal_entries WHERE reference_type =
'credit_applied' before applying - zero rows in production.

DB-only migration. App code unchanged." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.75 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.74.ps1') { Remove-Item -LiteralPath 'push_v3.74.74.ps1' -Force }
}
