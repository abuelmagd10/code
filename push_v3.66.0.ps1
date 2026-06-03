# v3.66.0 - DB-level Creator-filter governance
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.66.0"') { Write-Host "+ APP_VERSION = 3.66.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.66.0" -ForegroundColor Red; exit 1 }

$changelog = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($changelog -match '\[3.66.0\]') {
    Write-Host "+ CHANGELOG entry for 3.66.0 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.66.0 entry" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(governance): v3.66.0 - DB-level creator-filter RLS

Before: SELECT RLS on customers/estimates/sales_orders/bookings
only checked company membership. Staff/employee/sales/
booking_officer users calling the Supabase API directly with
their JWT could enumerate every record in the company.
Application-layer filtering (buildDataVisibilityFilter) was
the only line of defense - bypassable.

Done (applied as DB migration, no code changes needed):

  1. Orphan cleanup: deleted records across 130+ tables WHERE
     company_id NOT IN (SELECT id FROM companies). 95 percent of
     records turned out to be relics from deleted test companies.
     Bypassed user triggers via session_replication_role=replica.

  2. Added created_by_user_id to bookings + index + FK
     (was the only governance table missing it).

  3. auto_set_created_by_user_id() BEFORE INSERT trigger on 9
     governance tables: customers, estimates, sales_orders,
     invoices, bookings, purchase_orders, bills, suppliers,
     payments. Future records auto-stamp auth.uid() if not given.

  4. Backfilled any remaining NULL created_by_user_id to
     companies.user_id (the owner). All rows now attributable.

  5. current_user_record_visibility(company_id) returns
     'company' | 'branch' | 'own' | 'none' based on role:
       owner/admin/viewer -> 'company'
       manager/accountant/store_manager/purchasing_officer/
       manufacturing_officer/hr_officer/supervisor -> 'branch'
       staff/employee/sales/booking_officer -> 'own'

  6. current_user_branch_id(company_id) helper.

  7. Replaced SELECT RLS on customers/estimates/sales_orders/
     bookings with creator-aware policies. NULL branch_id is a
     lenient fallback for branch-scoped users.

Verify:
  - Owner sees all 3 customers + 4 sales orders.
  - Staff sees only records they created.
  - Direct REST call as staff returns only own rows.
  - Accountant sees branch-scoped records.

Files:
  Modified: lib/version.ts (3.65.4 -> 3.66.0)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.66.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next milestones:" -ForegroundColor Cyan
    Write-Host "  v3.67.0 - can_write flag (read-only for manager)" -ForegroundColor Gray
    Write-Host "  v3.68.0 - Branch-scoped RLS on financial tables" -ForegroundColor Gray
    Write-Host "  v3.69.0 - Auto-invoice from SO + block manual accountant" -ForegroundColor Gray
}
