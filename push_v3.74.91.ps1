# v3.74.91 - DB-only: overpayment triggers now post AR->2155 reclassification journal
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.91"') { Write-Host "+ APP_VERSION = 3.74.91" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.91" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.91]')) { Write-Host "+ CHANGELOG 3.74.91" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.91" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (should pass — no code changes) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; $tsc | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(accounting): v3.74.91 - overpayment triggers now post AR->2155 reclassification journal

User caught this: /customers correctly showed credit balance 5.68
(5.00 + 0.68 from an invoice overpayment), but every accounting report
showed only 5.00. The 0.68 was nowhere in the chart of accounts.

Root cause: two overpayment triggers create a customer_credits row but
neither posts the accounting reclassification journal. The customer's
internal credit balance was right, but accounting books showed:
- AR (1130): credited the full overpaid amount -> goes negative
- 2155 (customer credit liability): not touched -> under-reports credit

Every report that reads from chart_of_accounts was wrong by the sum of
all overpayments ever made. Real bookkeeping integrity bug.

DB-only migrations:
1. v3_74_91_overpayment_journal_correction - patches
   auto_create_credit_from_overpayment (payments path).
2. v3_74_91b_invoice_overpay_journal_correction - same for
   auto_create_credit_from_invoice_overpay (invoices path - this is
   the one INV-00003 hit).
3. Inline backfill DO-block - found every existing overpayment
   customer_credits row with no matching credit_from_overpayment
   journal and posted a balanced Dr AR / Cr 2155 entry.

Verified after backfill (in VitaSlims test company):
- 2155 net:           5.00 -> 5.68 (matches operational balance)
- customer_credits:   5.68    5.68
- AR (1130):         14.32 -> 15.00 (= INV-00005 remaining, no more negative leak)

Process note in the changelog body: I had previously told the user
'all reports work automatically' after v3.74.89. That generalized from
one matching data point - the user's second customer caught the bug.
From now on I cross-check multiple customers/scenarios before claiming
a system-wide property, and I treat user-reported discrepancies as
ground truth, not the other way around.

No code/TS changes - purely DB triggers + backfill." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.91 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.89.ps1') { Remove-Item -LiteralPath 'push_v3.74.89.ps1' -Force }
}
