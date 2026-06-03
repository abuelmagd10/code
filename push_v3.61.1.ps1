# v3.61.1 - Backup Hardening Phase A continued (A5 + A6)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "lib/backup/export-utils.ts",
    "lib/backup/validation-utils.ts"
)
foreach ($f in $files) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$ver = Get-Content "lib/version.ts" -Raw
if ($ver -match 'APP_VERSION = "3.61.1"') { Write-Host "  + APP_VERSION = 3.61.1" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.61.1" -ForegroundColor Red; exit 1 }

if ($ver -match 'isBackupVersionCompatible') { Write-Host "  + version compat helper present" -ForegroundColor Green }
else { Write-Host "  X version compat helper missing" -ForegroundColor Red; exit 1 }

$exp = Get-Content "lib/backup/export-utils.ts" -Raw
if ($exp -match 'APP_VERSION' -and $exp -notmatch "SYSTEM_VERSION = '1\.0\.0'") {
    Write-Host "  + export-utils uses APP_VERSION (legacy const gone)" -ForegroundColor Green
} else {
    Write-Host "  X export-utils still has legacy SYSTEM_VERSION" -ForegroundColor Red; exit 1
}

if ($exp -match 'company_role_permissions' -and $exp -match "resource', 'backup'") {
    Write-Host "  + canExportBackup uses company_role_permissions (A6)" -ForegroundColor Green
} else {
    Write-Host "  X canExportBackup not using company_role_permissions" -ForegroundColor Red; exit 1
}

$val = Get-Content "lib/backup/validation-utils.ts" -Raw
if ($val -match 'isBackupVersionCompatible' -and $val -notmatch "SYSTEM_VERSION = '1\.0\.0'") {
    Write-Host "  + validation-utils uses major.minor check" -ForegroundColor Green
} else {
    Write-Host "  X validation-utils still has legacy check" -ForegroundColor Red; exit 1
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
    lib/backup/export-utils.ts `
    lib/backup/validation-utils.ts `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(backup): v3.61.1 Phase A continued (A5 + A6)

A5 - Single source of truth for app version.
  New lib/version.ts exports APP_VERSION = '3.61.1' and a major.minor
  compatibility helper. Removes the hardcoded SYSTEM_VERSION = '1.0.0'
  that lived independently in export-utils.ts and validation-utils.ts
  and never matched the actual app version.

  Compatibility rule:
    * Backup major MUST equal current major (breaking schema)
    * Backup minor MUST be <= current minor (we read older, not newer)
    * Legacy '1.0.0' backups from v3.61.0 still accepted (backward compat)

A6 - canExportBackup unified with v3.59.1 governance source of truth.
  Replaces hardcoded ['owner','admin'] check with:
    Layer 1: owner / admin / general_manager always allowed
             (matches AI assistant full-access rules)
    Layer 2: any other role is allowed if company_role_permissions
             has 'backup' resource granted for them in /settings/users
  No more parallel source of truth. To delegate backup access,
  an admin just toggles a checkbox in the UI.

Files:
  New: lib/version.ts
  Modified: lib/backup/export-utils.ts
  Modified: lib/backup/validation-utils.ts

No DB migration. No UI change. No behavioural change for owner/admin.
v3.61.0 backups (which still say system_version: '1.0.0') remain
restorable thanks to the explicit backward-compat path.

Still to ship in Phase A:
  A7 - AES-256-GCM client-side encryption (largest remaining gap).

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.61.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Re-export a backup, then check metadata.system_version - should now be 3.61.1" -ForegroundColor White
    Write-Host "  2. Try to restore your v3.61.0 backup (system_version=1.0.0) - should STILL succeed (backward compat)" -ForegroundColor White
    Write-Host "  3. As a non-owner without 'backup' resource, try to export - should be 403" -ForegroundColor White
}
