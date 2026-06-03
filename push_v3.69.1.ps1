# v3.69.1 hotfix - DB-authoritative in access-context.tsx
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.69.1"') { Write-Host "+ APP_VERSION = 3.69.1" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.69.1" -ForegroundColor Red; exit 1 }

$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw

if ($ac -match "hasDbPermissions") {
    Write-Host "+ access-context: DB-authoritative branch present" -ForegroundColor Green
} else { Write-Host "X access-context: DB-authoritative branch missing" -ForegroundColor Red; exit 1 }

# Verify the strict staff fallback list (4 items, no dashboard/invoices)
if ($ac -match "staff: \['customers', 'estimates', 'sales_orders', 'inventory'\]") {
    Write-Host "+ access-context: staff fallback = 4 items strict" -ForegroundColor Green
} else { Write-Host "X access-context: staff fallback wrong" -ForegroundColor Red; exit 1 }

# Verify booking_officer fallback (2 items)
if ($ac -match "booking_officer: \['bookings', 'customers'\]") {
    Write-Host "+ access-context: booking_officer fallback = 2 items strict" -ForegroundColor Green
} else { Write-Host "X access-context: booking_officer fallback wrong" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts lib/access-context.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(sidebar): v3.69.1 - AccessContext was OR-merging hardcoded defaults

After v3.69.0 the DB had the spec exactly (staff = 4 pages),
but the live sidebar still showed 7 entries: dashboard,
invoices, product_availability leaking in.

Root cause:
  lib/access-context.tsx was initializing allowed_pages =
  defaultRolePages[role] (a v3.55-era hardcoded list with 8
  items for staff) then ADDING DB rows on top. The DB had no
  way to REMOVE entries from that hardcoded baseline unless we
  explicitly inserted can_access=false rows.

Fix:
  Made the DB authoritative when the role has ANY rows in
  company_role_permissions. allowed_pages is built strictly from
  DB rows where access is granted, period. The hardcoded
  defaultRolePages map remains only as a last-resort fallback
  (when DB has zero rows for a role), and has been rewritten
  to mirror the verbatim Ahmed spec.

Verify:
  Hard-refresh staff user sidebar -> shows exactly 4 items:
  customers, estimates, sales_orders, inventory. No dashboard,
  no invoices, no product_availability, no attendance.

Files:
  Modified: lib/access-context.tsx (DB-authoritative + verbatim fallback)
  Modified: lib/version.ts (3.69.0 -> 3.69.1)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.69.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tell staff user (khaled) to hard-refresh Ctrl+Shift+R after deploy." -ForegroundColor Cyan
}
