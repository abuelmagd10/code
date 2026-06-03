# v3.69.0 - VERBATIM strict spec (no dashboard for 5 roles)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.69.0"') { Write-Host "+ APP_VERSION = 3.69.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.69.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.69.0\]') { Write-Host "+ CHANGELOG entry for 3.69.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.69.0 entry" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

# staff must be exactly 4 items (no dashboard)
if ($usr -match "staff: \['customers', 'estimates', 'sales_orders', 'inventory'\]") {
    Write-Host "+ staff = 4 items (no dashboard)" -ForegroundColor Green
} else { Write-Host "X staff defaults wrong" -ForegroundColor Red; exit 1 }

# booking_officer must be exactly 2 items (no dashboard)
if ($usr -match "booking_officer: \['bookings', 'customers'\]") {
    Write-Host "+ booking_officer = 2 items (no dashboard)" -ForegroundColor Green
} else { Write-Host "X booking_officer defaults wrong" -ForegroundColor Red; exit 1 }

# manufacturing_officer must be exactly 2 items (no dashboard)
if ($usr -match "manufacturing_officer: \['manufacturing_boms', 'approvals'\]") {
    Write-Host "+ manufacturing_officer = 2 items (no dashboard)" -ForegroundColor Green
} else { Write-Host "X manufacturing_officer defaults wrong" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/settings/users/page.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(roles): v3.69.0 - VERBATIM spec, removed dashboard from 5 roles

Ahmed did not list dashboard for staff, purchasing_officer,
booking_officer, manufacturing_officer, store_manager. Only
accountant has it explicitly. Manager inherits it via union.

Done in DB (already applied):
  - Updated seed_default_role_permissions(company_id) function
  - Re-applied to company tist
  - Trigger on companies INSERT continues auto-seeding

Final per-role counts (matches spec exactly):
  staff:                 4  (customers, estimates, sales_orders, inventory)
  accountant:           17  (dashboard explicit + 16 finance/inventory)
  purchasing_officer:    5  (suppliers, POs, inventory(R), dispatch(R), receipt(R))
  booking_officer:       2  (bookings, customers)
  manufacturing_officer: 2  (manufacturing_boms umbrella, approvals)
  store_manager:         6  (inventory, transfers, third_party(R), write_offs, dispatch, receipt)
  manager:              25  (union, ALL read-only)

Code:
  app/settings/users/page.tsx defaultSidebarResourcesByRole
  mirrors the DB function exactly.

Post-login routing note:
  Users without dashboard access will land on first allowed page.
  If /dashboard redirects them on login, that is a follow-up
  routing fix - flagged not included in this strict-spec release.

Files:
  Modified: lib/version.ts (3.68.0 -> 3.69.0)
  Modified: app/settings/users/page.tsx
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.69.0 pushed" -ForegroundColor Green
}
