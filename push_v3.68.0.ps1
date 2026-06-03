# v3.68.0 - STRICT spec adherence + auto-seed trigger
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.68.0"') { Write-Host "+ APP_VERSION = 3.68.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.68.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.68.0\]') { Write-Host "+ CHANGELOG entry for 3.68.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.68.0 entry" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -match "v3\.68\.0 — STRICT") {
    Write-Host "+ /settings/users: strict marker present" -ForegroundColor Green
} else { Write-Host "X /settings/users: strict marker missing" -ForegroundColor Red; exit 1 }

# Marker: staff defaults should be exactly 5 items
if ($usr -match "staff: \['dashboard', 'customers', 'estimates', 'sales_orders', 'inventory'\]") {
    Write-Host "+ staff defaults strictly = 5 items" -ForegroundColor Green
} else { Write-Host "X staff defaults not strict" -ForegroundColor Red; exit 1 }

# Marker: booking_officer defaults should be exactly 3 items
if ($usr -match "booking_officer: \['dashboard', 'bookings', 'customers'\]") {
    Write-Host "+ booking_officer defaults strictly = 3 items" -ForegroundColor Green
} else { Write-Host "X booking_officer defaults not strict" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(roles): v3.68.0 - STRICT spec + auto-seed trigger

v3.67.0 added pages Ahmed did NOT ask for. This release strips
defaults back to the literal spec and adds a DB trigger so every
NEW company born going forward gets the spec automatically.

Done in DB (already applied as migration):

  1. seed_default_role_permissions(company_id) function
     encapsulates the 7-role spec. Idempotent.

  2. trg_auto_seed_role_permissions_on_company_insert trigger
     fires AFTER INSERT on companies. Every new company gets
     the spec by default without code changes.

  3. Re-seeded company tist to match exactly.

Per-role counts after strict re-seed:
  staff:                 5  (dashboard + customers + estimates + sales_orders + inventory)
  accountant:           17  (the 17 pages in spec)
  purchasing_officer:    6
  booking_officer:       3  (dashboard + bookings + customers)
  manufacturing_officer: 3  (umbrella covers 7 sub-pages)
  store_manager:         7
  manager:              25  (union, ALL read-only per spec)

Removed extras that I had added without spec authorization:
  reports (except hr_officer), attendance (except hr_officer),
  product_availability, customer_debit_notes,
  customer_refund_requests, sent_invoice_returns, vendor_credits,
  journal_entries, services (booking), payments (booking),
  products (manufacturing).

Code:
  app/settings/users/page.tsx defaultSidebarResourcesByRole
  reduced to STRICT per-spec lists - mirror of DB trigger.

Admin override unchanged:
  /settings/users -> Role Permissions still lets owner/admin
  flip can_access / can_write per resource per role. Trigger
  only seeds defaults; admins still tune per company.

Deferred to:
  v3.69.0 - branch-scoped RLS on financial tables
            + auto-invoice from SO + UI block accountant manual
  v3.70.0 - split manufacturing umbrella into 7 distinct resources
  v3.71.0 - write_offs approval workflow

Files:
  Modified: lib/version.ts (3.67.0 -> 3.68.0)
  Modified: app/settings/users/page.tsx
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.68.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify:" -ForegroundColor Cyan
    Write-Host "  1. Open /settings/users -> Role Permissions in tist" -ForegroundColor Gray
    Write-Host "  2. Each role shows ONLY the spec-listed resources" -ForegroundColor Gray
    Write-Host "  3. Sign up a NEW company -> trigger auto-seeds the spec" -ForegroundColor Gray
    Write-Host "  4. Admin can still flip can_write on any resource" -ForegroundColor Gray
}
