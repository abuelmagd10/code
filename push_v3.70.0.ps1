# v3.70.0 - Phase A: Permission system safety fixes
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.70.0"') { Write-Host "+ APP_VERSION = 3.70.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.70.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.70.0\]') { Write-Host "+ CHANGELOG entry for 3.70.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.70.0 entry" -ForegroundColor Red; exit 1 }

# Both permissions APIs must NOT include manager
$pa = Get-Content -LiteralPath "app/api/permissions/route.ts" -Raw
if ($pa -match 'allowedRoles = \["owner", "admin", "general_manager"\]') {
    Write-Host "+ /api/permissions: manager removed from POST allowedRoles" -ForegroundColor Green
} else { Write-Host "X /api/permissions still has manager in allowedRoles" -ForegroundColor Red; exit 1 }

$pt = Get-Content -LiteralPath "app/api/permissions/transfer/route.ts" -Raw
if ($pt -match 'allowedRoles = \["owner", "admin", "general_manager"\]') {
    Write-Host "+ /api/permissions/transfer: manager removed from allowedRoles" -ForegroundColor Green
} else { Write-Host "X /api/permissions/transfer still has manager in allowedRoles" -ForegroundColor Red; exit 1 }

# Cron endpoint must exist
if (Test-Path "app/api/cron/expire-permission-shares/route.ts") {
    Write-Host "+ /api/cron/expire-permission-shares route exists" -ForegroundColor Green
} else { Write-Host "X cron route missing" -ForegroundColor Red; exit 1 }

# vercel.json must include the new cron
$vj = Get-Content -LiteralPath "vercel.json" -Raw
if ($vj -match 'expire-permission-shares') {
    Write-Host "+ vercel.json: expire-permission-shares cron schedule present" -ForegroundColor Green
} else { Write-Host "X vercel.json missing the new cron" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/api/permissions/route.ts `
        app/api/permissions/transfer/route.ts `
        app/api/cron/expire-permission-shares/route.ts `
        vercel.json `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(permissions): v3.70.0 - Phase A safety fixes

Audit of /settings/users -> Permission Sharing/Transfer flagged
three issues. Phase A fixes them; Phase B (RLS enforced sharing,
more resources, shared-with-me panel) and Phase C (position
hierarchy, approval workflow) deferred.

Fixed:

  1. permission_transfers schema/API mismatch.
     API wrote status, records_transferred, transfer_data into a
     table that had none of those columns. Every transfer failed
     silently or partially. Added the 3 columns + check constraint
     on status + 2 indexes for cron-style queries.

  2. manager could share/transfer despite v3.67.0 read-only spec.
     Both /api/permissions and /api/permissions/transfer listed
     'manager' in allowedRoles. Dropped from both. Now only
     owner / admin / general_manager can grant or transfer.

  3. No automatic expiration enforcement.
     permission_sharing.expires_at was collected but never honored.
     Added expire_permission_shares() DB function + Vercel cron
     /api/cron/expire-permission-shares at 04:00 UTC daily, gated
     by CRON_SECRET with audit-log entry per run.

Added:
  trg_cleanup_permission_sharing_on_member_leave - DELETE trigger
  on company_members that flips is_active=false on any shares
  where the leaver was grantor or grantee, with annotation in notes.
  Removes the dangling-reference footgun.

Verify:
  - manager trying to share -> 403
  - transfer creates permission_transfers row with status=completed
    and non-zero records_transferred
  - cron endpoint shows in Vercel Crons list, returns 200 on
    authenticated GET
  - deleting a company_members row deactivates their shares

Files:
  DB migration: v3_70_0_phase_a_permission_safety_fixes
  Modified: app/api/permissions/route.ts (manager dropped)
  Modified: app/api/permissions/transfer/route.ts (manager dropped)
  Modified: vercel.json (added expire-permission-shares cron)
  Modified: lib/version.ts (3.69.1 -> 3.70.0)
  Modified: CHANGELOG.md
  New: app/api/cron/expire-permission-shares/route.ts

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.70.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: Phase B (after this is verified):" -ForegroundColor Cyan
    Write-Host "  - shared-with-me panel for the grantee" -ForegroundColor Gray
    Write-Host "  - RLS-enforced sharing on customers + sales_orders" -ForegroundColor Gray
    Write-Host "  - expand sharing to invoices, bills, suppliers, ..." -ForegroundColor Gray
}
