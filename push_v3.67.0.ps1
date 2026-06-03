# v3.67.0 - Full role spec per Ahmed + can_write flag
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.67.0"') { Write-Host "+ APP_VERSION = 3.67.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.67.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.67.0\]') { Write-Host "+ CHANGELOG entry for 3.67.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.67.0 entry" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -match "Ahmed's enterprise spec" -or $usr -match "v3\.67\.0") {
    Write-Host "+ /settings/users: spec marker present" -ForegroundColor Green
} else { Write-Host "X /settings/users: spec marker missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(roles): v3.67.0 - full role spec + can_write flag

Implements Ahmed's enterprise ERP role spec end-to-end. Every
role's resource list now matches the spec exactly, all of it
editable from /settings/users -> Role Permissions UI.

Done (DB + code):

  1. can_write column added to company_role_permissions
     (default true). Read-only when false. Editable from UI.

  2. Permissions re-seeded for company tist to match the spec:
     - owner/admin: 39 resources, full power
     - manager: 37 resources, ALL read-only (branch auditor)
     - viewer: 34 resources, read-only org-wide
     - accountant: 23 resources (6 read-only)
     - store_manager: 10 resources
     - purchasing_officer: 8 resources
     - hr_officer: 7 resources
     - manufacturing_officer: 7 resources
     - staff (sales rep): 7 resources
     - booking_officer: 6 resources

  3. defaultSidebarResourcesByRole in /settings/users rewritten
     to match the spec for every role. NEW companies will get
     these defaults; existing companies keep their per-company
     overrides from company_role_permissions.

  4. Existing UI already saved can_write/can_read/can_update/
     can_delete - no schema changes needed for editability.

Spec by role:

  1. staff (sales rep): customers + estimates + SO + inventory(R)
     + product_availability(R) + attendance + dashboard
  2. accountant: 23 resources branch-scoped, products/services
     read-only, dispatch_approvals/goods_receipt read-only
  3. purchasing_officer: suppliers + POs + inventory(R) +
     product_availability(R) + dispatch_approvals(R) +
     goods_receipt(R) + dashboard + reports
  4. booking_officer: bookings + customers + services(R) +
     payments + dashboard + reports
  5. manufacturing_officer: manufacturing(umbrella) + approvals
     + products(R) + inventory(R) + product_availability(R)
  6. store_manager: products(R) + inventory + transfers +
     third_party(R) + write_offs + dispatch_approvals +
     goods_receipt + product_availability(R)
  7. manager (branch manager): all 37 pages above READ-ONLY

Deferred to next versions:
  v3.68.0 - branch-scoped RLS on 15 financial tables
  v3.69.0 - auto-invoice from SO + block accountant manual create
  v3.70.0 - split manufacturing umbrella into 7 distinct resources
  v3.71.0 - write_offs + inventory_transfers approval workflow

Files:
  Modified: lib/version.ts (3.66.0 -> 3.67.0)
  Modified: app/settings/users/page.tsx
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.67.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after deploy:" -ForegroundColor Cyan
    Write-Host "  1. /settings/users -> Role Permissions -> select each role" -ForegroundColor Gray
    Write-Host "  2. Lists per spec, can_write toggle visible per resource" -ForegroundColor Gray
    Write-Host "  3. Invite a new staff user -> sees ONLY their own customers" -ForegroundColor Gray
    Write-Host "  4. Invite a new manager -> sees 37 pages all read-only" -ForegroundColor Gray
}
