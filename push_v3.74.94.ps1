# v3.74.94 - 12 additional integrity checks (DB-only, framework auto-picks them up)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.93.ps1") { Remove-Item -LiteralPath "push_v3.74.93.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.94"') { Write-Host "+ APP_VERSION = 3.74.94" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.94" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.94]')) { Write-Host "+ CHANGELOG 3.74.94" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.94" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (DB-only release - should pass cleanly) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; $tsc | Select-Object -First 15 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.94 - 12 more integrity checks (28 total)

DB-only release. The framework from v3.74.93 picks the new checks up
automatically via the registry — no edits to API / widget / cron.

Critical (4):
- payment_double_allocation: payment linked both via invoice_id and
  advance_applications (double-count)
- closed_period_mutations: posted journal inside a closed accounting
  period, created after closure
- tax_accuracy: invoice.tax_amount vs sum of line tax > 1 EGP diff
- branch_isolation: journal references a branch from another company

Inventory (2):
- inventory_cost_drift: sale-tx unit_cost vs avg FIFO cost > 0.10 diff
- linked_so_no_invoice: sales_order.invoice_id points to deleted invoice

Operational (6):
- bonus_reversal_pending: approved return on bonused invoice without
  reversal row in user_bonuses
- perm_shares_expired: permission_sharing is_active=true but expires_at
  is past
- sales_return_no_journal: approved return without posted journal
- accounting_equation: Assets != Liabilities + Equity (sanity check)
- payment_no_journal: approved payment with journal_entry_id IS NULL
- estimate_orphans: sales_order.source_estimate_id points to deleted
  estimate

Original plan had manufacturing_yield_variance + refund_without_journal,
but production_orders and customer_refunds tables don't exist in this
schema. Swapped for sales_return_no_journal + payment_no_journal -
same risk class on tables that do exist.

Every check has EXCEPTION WHEN OTHERS/undefined_table/undefined_column
guards so a missing optional table doesn't break the run.

Registry totals: accounting 13, inventory 7, operational 8 = 28 checks.
Test on VitaSlims company: zero findings." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.94 pushed" -ForegroundColor Green
}
