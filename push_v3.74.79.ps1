# v3.74.79 - DB trigger: invoice overpayment auto-creates customer_credits
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.79"') { Write-Host "+ APP_VERSION = 3.74.79" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.79" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.79]')) { Write-Host "+ CHANGELOG 3.74.79" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.79" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (DB-only, no app code changes) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "invoices/page\.tsx|customer-credits/.*page\.tsx|payments/page\.tsx|version\.ts"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(credit): v3.74.79 - invoice overpayment trigger closes v3.74.77 gap

The /customer-credits page was still missing customers after v3.74.77/78.
Investigation found INV-00003 (ahmed abuelmagd, paid 10.68 vs total 10.00)
had 0.68 of overpayment with no customer_credits row. The v3.74.77 trigger
only fires on payments.unallocated_amount > 0, but this scenario links
the whole payment to the invoice and grows invoices.paid_amount past
total_amount - unallocated_amount stays zero so the existing trigger
never fires.

New trigger trg_auto_create_credit_from_invoice_overpay on invoices
(AFTER INSERT OR UPDATE OF paid_amount, total_amount). When the row
settles with paid > total, creates a customer_credits row with
reference_type='invoice_overpayment'. Amount is paid - total (not paid -
max(0, total - returned), which would double-count with the return path).
Guards: skip if returned_amount > 0 (return path owns that case), skip if
status is cancelled or draft, existence-checked by (ref_type, ref_id) so
re-firing updates instead of duplicating while still untouched.

Chains into the v3.74.76 sync trigger - ledger picks up the row, both
list and detail pages now see the balance.

Backfill: no-op UPDATE on invoices matching the new condition fires the
trigger on existing rows. INV-00003 gets its 0.68 credit row created.

Verified after migration: ledger now has 2 customers with positive
balance (was 1). INV-00004 still single-credited via return path
(returned_amount > 0 - new trigger skips, no double-count).

DB-only. No TS changes." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.79 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.78.ps1') { Remove-Item -LiteralPath 'push_v3.74.78.ps1' -Force }
}
