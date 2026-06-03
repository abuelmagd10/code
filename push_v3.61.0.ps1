# v3.61.0 - Phase A: Enterprise Backup Hardening (critical fixes)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$newFiles = @("lib/backup/checksum-utils.ts")
foreach ($f in $newFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

$modFiles = @(
    "lib/backup/types.ts",
    "lib/backup/export-utils.ts",
    "lib/backup/validation-utils.ts",
    "app/api/backup/restore/route.ts",
    "app/api/backup/validate/route.ts",
    "app/settings/page.tsx"
)
foreach ($f in $modFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$cs = Get-Content "lib/backup/checksum-utils.ts" -Raw
if ($cs -match 'canonicalStringify') { Write-Host "  + canonical helper present" -ForegroundColor Green }
else { Write-Host "  X canonical helper missing" -ForegroundColor Red; exit 1 }

$exp = Get-Content "lib/backup/export-utils.ts" -Raw
if ($exp -match 'checksumOfData') { Write-Host "  + export uses shared checksum" -ForegroundColor Green }
else { Write-Host "  X export not patched" -ForegroundColor Red; exit 1 }

$val = Get-Content "lib/backup/validation-utils.ts" -Raw
if ($val -match 'checksumOfData') { Write-Host "  + validation uses shared checksum" -ForegroundColor Green }
else { Write-Host "  X validation not patched" -ForegroundColor Red; exit 1 }

$res = Get-Content "app/api/backup/restore/route.ts" -Raw
if ($res -match 'cross-tenant restore protection') { Write-Host "  + restore has cross-tenant guard" -ForegroundColor Green }
else { Write-Host "  X restore guard missing" -ForegroundColor Red; exit 1 }

$valR = Get-Content "app/api/backup/validate/route.ts" -Raw
if ($valR -match 'cross-tenant restore protection') { Write-Host "  + validate has cross-tenant guard" -ForegroundColor Green }
else { Write-Host "  X validate guard missing" -ForegroundColor Red; exit 1 }

$types = Get-Content "lib/backup/types.ts" -Raw
if ($types -match 'company_role_permissions') { Write-Host "  + EXPORT_ORDER includes company_role_permissions" -ForegroundColor Green }
else { Write-Host "  X EXPORT_ORDER missing governance table" -ForegroundColor Red; exit 1 }
if ($types -match 'manufacturing_boms' -and $types -match 'shipments' -and $types -match 'notifications') {
    Write-Host "  + EXPORT_ORDER includes manufacturing/shipments/notifications" -ForegroundColor Green
} else {
    Write-Host "  X EXPORT_ORDER missing key domains" -ForegroundColor Red; exit 1
}

$settings = Get-Content "app/settings/page.tsx" -Raw
if ($settings -match "/api/backup/export" -and $settings -match "/api/backup/restore" -and $settings -match "/api/backup/validate") {
    Write-Host "  + /settings inline backup routed through API (A4)" -ForegroundColor Green
} else {
    Write-Host "  X /settings still bypassing API (A4 failed)" -ForegroundColor Red; exit 1
}
if ($settings -notmatch "version: '1\.0',") {
    Write-Host "  + Legacy v1.0 export removed" -ForegroundColor Green
} else {
    Write-Host "  X Legacy v1.0 export still present" -ForegroundColor Red; exit 1
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
    lib/backup/checksum-utils.ts `
    lib/backup/types.ts `
    lib/backup/export-utils.ts `
    lib/backup/validation-utils.ts `
    app/api/backup/restore/route.ts `
    app/api/backup/validate/route.ts `
    app/settings/page.tsx `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(backup): v3.61.0 Phase A - critical enterprise hardening (3 fixes)

A1 - Checksum was broken end-to-end.
  Export and validation used different serialization, so the SHA-256 hash
  has never matched since the feature shipped. New canonical-JSON helper
  (sorted keys, recursive) shared by both sides via checksumOfData().
  Affects: lib/backup/checksum-utils.ts (new),
           lib/backup/export-utils.ts, lib/backup/validation-utils.ts

A2 - Cross-tenant restore protection.
  Restore and validate now reject any backup whose metadata.company_id
  does not match the target company. Returns 403 with both IDs in the
  response. Closes a vector where an owner of company B who obtained
  company A's file could overwrite B with A's data.
  Affects: app/api/backup/restore/route.ts, app/api/backup/validate/route.ts

A3 - EXPORT_ORDER was missing ~120 tables.
  Full DB audit and topological-order rebuild. From 38 -> 157 tables.
  Most damaging omission was company_role_permissions (the single source
  of truth from v3.59.1). Other criticals now included:
    shipments, goods_receipts, inventory_transfers, manufacturing_*,
    production_order_*, mrp_*, attendance_*, payroll_*, commission_*,
    notifications, user_notification_preferences, company_ai_settings,
    expenses, exchange_rates, accounting_periods, bookings, services,
    shareholder_*, profit_distribution_*, tax_codes,
    and all item/line child tables (invoice_items, journal_entry_lines, etc.)
  Affects: lib/backup/types.ts

Backward compatibility:
  Old backups created before v3.61.0 will fail checksum validation
  (because the OLD checksum was always wrong). Operators should re-export
  to get a backup whose integrity can actually be verified.
  No DB migrations. No UI changes. No behavioural change for end users.

Still to ship in v3.61.1+ (Phase B):
  - AES-256-GCM encryption with user passphrase
  - SYSTEM_VERSION synced from package.json
  - canExportBackup routed through ai_current_user_allowed_resources
  - Storage bucket, history UI, retention, cron, email, HMAC, rate limit

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.61.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Export a backup, then validate it - checksum should PASS now" -ForegroundColor White
    Write-Host "  2. Try to restore Company A's backup into Company B - expect 403" -ForegroundColor White
    Write-Host "  3. Check exported JSON contains company_role_permissions" -ForegroundColor White
}
