# v3.61.3 - CRITICAL hotfix: child tables now actually exported
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "lib/backup/types.ts",
    "lib/backup/export-utils.ts"
)
foreach ($f in $files) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.61.3"') { Write-Host "  + APP_VERSION = 3.61.3" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.61.3" -ForegroundColor Red; exit 1 }

$types = Get-Content "lib/backup/types.ts" -Raw
if ($types -match 'CHILD_TABLE_PARENTS') { Write-Host "  + CHILD_TABLE_PARENTS map present" -ForegroundColor Green }
else { Write-Host "  X CHILD_TABLE_PARENTS missing" -ForegroundColor Red; exit 1 }

# Spot-check the 4 most-critical mappings (lines/items)
foreach ($t in @("invoice_items","journal_entry_lines","sales_order_items","payment_allocations")) {
    if ($types -match $t) {
        Write-Host "  + $t mapped" -ForegroundColor Green
    } else {
        Write-Host "  X $t missing from map" -ForegroundColor Red; exit 1
    }
}

# Spot-check the non-obvious FKs
foreach ($fk in @("transfer_id","write_off_id","distribution_id")) {
    if ($types -match "fk: '$fk'") {
        Write-Host "  + $fk (non-conventional FK) mapped" -ForegroundColor Green
    } else {
        Write-Host "  X $fk mapping missing" -ForegroundColor Red; exit 1
    }
}

$exp = Get-Content "lib/backup/export-utils.ts" -Raw
if ($exp -match 'CHILD_TABLE_PARENTS\[tableName\]' -and $exp -match 'parentMap.fk') {
    Write-Host "  + export-utils branches on parent map" -ForegroundColor Green
} else {
    Write-Host "  X export-utils not using parent map" -ForegroundColor Red; exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add `
    lib/version.ts `
    lib/backup/types.ts `
    lib/backup/export-utils.ts `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(backup): v3.61.3 CRITICAL - child tables now actually exported

Discovered during the v3.61.2 end-to-end test:
The restore preview showed invoices: 4 but invoice_items: 0,
journal_entries: 13 but journal_entry_lines: 0, sales_orders: 4 but
sales_order_items: 0, bills: 1 but bill_items: 0 — every business
document was an empty shell.

Root cause:
The export ran SELECT * WHERE company_id = ? against EVERY table in
EXPORT_ORDER. But 22 tables have NO company_id column - they inherit
company scope through an FK to their parent (invoices -> invoice_items
via invoice_id, etc.). The .eq('company_id', ...) query returned 0
rows for those tables and the result was silently treated as 'empty'.

Fix:
New CHILD_TABLE_PARENTS map in lib/backup/types.ts. The export loop now
picks the right strategy:
  - parent tables: queried by company_id (unchanged)
  - child tables:  queried by parent_fk IN (<parent_ids_for_company>)
Topological order in EXPORT_ORDER guarantees parent rows are already
in memory when the child query runs.

A few non-obvious FK names caught during the audit:
  inventory_transfer_items.transfer_id   (NOT inventory_transfer_id)
  inventory_write_off_items.write_off_id (NOT inventory_write_off_id)
  profit_distribution_lines.distribution_id (NOT profit_distribution_id)

Affected tables (22):
  invoice_items, bill_items, sales_order_items, purchase_order_items,
  sales_return_items, purchase_return_items, customer_debit_note_items,
  vendor_credit_items, estimate_items, goods_receipt_items,
  purchase_request_items, inventory_transfer_items,
  inventory_write_off_items, journal_entry_lines,
  bank_reconciliation_lines, budget_lines, payroll_items,
  profit_distribution_lines, customer_credit_applications,
  customer_debit_note_applications, vendor_credit_applications,
  payment_allocations

Severity: CRITICAL.
Backups taken before v3.61.3 would restore documents without any line
items - unbalanced books, no posted journal lines, no payment
allocations. Re-export after this deploys.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.61.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Re-export a backup, open the preview/restore dialog" -ForegroundColor White
    Write-Host "  2. Verify: invoice_items >= invoices, journal_entry_lines >= journal_entries" -ForegroundColor White
    Write-Host "  3. Specifically expect for the test company:" -ForegroundColor White
    Write-Host "     - invoice_items: 4 (matches 4 invoices)" -ForegroundColor White
    Write-Host "     - journal_entry_lines: roughly 26 (~13 entries x 2 lines each)" -ForegroundColor White
    Write-Host "     - bill_items: at least 1 (matches 1 bill)" -ForegroundColor White
}
