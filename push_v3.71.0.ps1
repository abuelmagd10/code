# v3.71.0 - Phase B: RLS-enforced sharing + shared-with-me panel
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.71.0"') { Write-Host "+ APP_VERSION = 3.71.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.71.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.71.0\]') { Write-Host "+ CHANGELOG entry for 3.71.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.71.0 entry" -ForegroundColor Red; exit 1 }

# New API endpoint must exist
if (Test-Path "app/api/permissions/shared-with-me/route.ts") {
    Write-Host "+ /api/permissions/shared-with-me route exists" -ForegroundColor Green
} else { Write-Host "X shared-with-me route missing" -ForegroundColor Red; exit 1 }

# UI markers: new tab + estimates option in dropdown
$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

if ($usr -match 'value="shared_with_me"') {
    Write-Host "+ /settings/users: shared_with_me tab present" -ForegroundColor Green
} else { Write-Host "X shared_with_me tab missing" -ForegroundColor Red; exit 1 }

if ($usr -match 'SelectItem value="estimates"' -and $usr -match 'SelectItem value="bookings"') {
    Write-Host "+ share dialog: estimates + bookings options added" -ForegroundColor Green
} else { Write-Host "X share dialog options missing" -ForegroundColor Red; exit 1 }

if ($usr -match 'setSharedWithMe') {
    Write-Host "+ sharedWithMe state + loader wired" -ForegroundColor Green
} else { Write-Host "X sharedWithMe state missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/settings/users/page.tsx `
        app/api/permissions/shared-with-me/route.ts `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(permissions): v3.71.0 - Phase B RLS-enforced sharing + shared-with-me

Phase B of the permission system audit. Phase A (v3.70.0) fixed
the schema/API bug and the cron. This release closes the data-
layer hole: sharing now works through RLS itself, not just in
app code. A direct Supabase REST call as the grantee now sees
shared records, same as the in-app /customers and /sales-orders
pages do.

Done in DB:

  1. has_shared_access(company_id, resource_type, created_by)
     STABLE SECURITY DEFINER helper. Returns true iff current
     user is grantee of an active, non-expired share from the
     record's creator for the given resource (or 'all').

  2. Replaced SELECT RLS on customers, estimates, sales_orders,
     bookings - the four creator-filtered tables from v3.66.0.
     Each new policy adds an OR clause:
       OR has_shared_access(company_id, '<table>', created_by_user_id)
     Old _v2 policies dropped; new _v3 policies live.

  3. v_shared_with_me VIEW - inbound shares for auth.uid().

Done in API:
  - New GET /api/permissions/shared-with-me. Returns rows from
    v_shared_with_me enriched with grantor display name + email.

Done in UI:
  - New 'shared_with_me' tab in /settings/users -> 'نقل وفتح'
    card. Shows grantor name, resource badge, can_edit/can_delete,
    expiry, and notes per inbound share.
  - Share dialog dropdown expanded from 3 options to 5:
    all / customers / estimates / sales_orders / bookings.
  - Resource label rendering in 'المشاركات' tab updated for the
    new types.

Verify:
  - User B receives a customers share from A
  - GET /rest/v1/customers directly as B returns own + shared
  - /settings/users -> 'مُشارَك مَعى' tab shows the new entry
  - Estimate-only share -> only A's estimates show, not customers

Deferred to Phase C:
  - Position hierarchy (manager auto-sees subordinates)
  - Approval workflow on transfers
  - Expanding to invoices/bills/suppliers (need creator-RLS first)

Files:
  DB migration: v3_71_0_phase_b_rls_enforced_sharing
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.70.0 -> 3.71.0)
  Modified: CHANGELOG.md
  New: app/api/permissions/shared-with-me/route.ts

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.71.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Phase C remaining (after this is verified):" -ForegroundColor Cyan
    Write-Host "  - Position hierarchy" -ForegroundColor Gray
    Write-Host "  - Approval workflow on transfers" -ForegroundColor Gray
    Write-Host "  - Vacation-cover one-click delegate" -ForegroundColor Gray
}
