# v3.74.97 - 10 more integrity checks (43 total) - data integrity + workflow + admin
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.96.ps1") { Remove-Item -LiteralPath "push_v3.74.96.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.97"') { Write-Host "+ APP_VERSION = 3.74.97" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.97" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.97]')) { Write-Host "+ CHANGELOG 3.74.97" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.97" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (DB-only) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.97 - 10 more integrity checks (43 total)

Two themes in one DB-only release (10 SQL functions + 10 registry rows):

Data integrity (5):
- customer_duplicate_phone: multiple active customers sharing one phone
- duplicate_journals: two posted journals with same (ref_type, ref_id)
- inventory_valuation_drift: 1140 vs SUM(stock * cost_price)
- bonus_invoice_orphan: user_bonuses.invoice_id -> deleted invoice
- return_total_mismatch: sales_returns header vs items sum

Workflow + admin (5):
- workflow_stuck: expenses/return-requests pending > 30 days
- subscription_past_due: status=past_due AND period_end < today-14
- stale_critical_notifications: critical/high unread > 30 days
- backup_stale: last successful backup > 7 days
- bank_transfer_unbalanced: bank_transfer journal < 2 cash/bank lines

Structural integrity (5):
- booking_no_invoice: completed booking without invoice link
- branch_no_warehouse: active branch with no active warehouse
- company_no_owner: company with no role=owner member
- unbalanced_journals: posted journal with SUM(debit) != SUM(credit)
- financial_op_no_audit: > 5 invoices in 30d without audit_log

Registry totals: 19 accounting + 9 inventory + 20 operational = 48.

Verified: VitaSlims test returns only the 2 stale FX drafts already
known from v3.74.96 - zero new false positives.

All new functions used information_schema.columns lookups before
writing SQL to avoid v3.74.95-class column-name bugs.

Pattern proven: 5 releases (93->97), 43 checks added with zero changes
to API / widget / cron / vercel.json. The framework can keep growing
indefinitely with no architectural ceiling." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.97 pushed" -ForegroundColor Green
}
