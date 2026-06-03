# v3.74.0 - Critical security fix + Realtime push for shares
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.0"') { Write-Host "+ APP_VERSION = 3.74.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.0\]') { Write-Host "+ CHANGELOG entry for 3.74.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.0 entry" -ForegroundColor Red; exit 1 }

$rm = Get-Content -LiteralPath "lib/realtime-manager.ts" -Raw
if ($rm -match "'permission_sharing'" -and $rm -match "'permission_transfers'") {
    Write-Host "+ realtime-manager: permission_sharing/transfers added" -ForegroundColor Green
} else { Write-Host "X realtime-manager missing permission tables" -ForegroundColor Red; exit 1 }

$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
if ($ac -match "access-shares-" -and $ac -match "postgres_changes") {
    Write-Host "+ access-context: realtime channel for permission_sharing wired" -ForegroundColor Green
} else { Write-Host "X access-context realtime wiring missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        lib/realtime-manager.ts `
        lib/access-context.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(security)+feat(realtime): v3.74.0 - resource-aware visibility + share realtime

CRITICAL SECURITY FIX:
  Ahmed tested in tist company: granted a customer share from
  staff to accountant. Accountant could see ALL branch customers,
  not just the shared one. Root cause: v3.66.0 RLS used
  current_user_record_visibility(company_id) which returned the
  role's natural scope ('branch' for accountant) even on resources
  the role wasn't supposed to access.

  Per v3.69.0 strict spec, accountant has no 'customers' in their
  company_role_permissions. So they should only see customers via
  sharing, never via branch access.

  Fix:
    New function current_user_resource_visibility(company, resource):
      - 'company' for owner/admin/company owner
      - 'company' for viewer IF role has the resource
      - 'branch' for branch-scoped roles IF role has the resource
      - 'own' for staff/sales IF role has the resource
      - 'none' if role doesn't have the resource (sharing is the
        only path to access)

  RLS on customers/estimates/sales_orders/bookings replaced with
  _v4 policies calling the new function.

  Net effect: accountant in tist now sees zero customers by
  default. Only shared records appear. Owner still sees all.

REALTIME PUSH:
  Project already has lib/realtime-manager.ts + realtime-provider
  + use-realtime-table hook - we just hadn't plumbed
  permission_sharing into it. v3.73.3 required manual refresh.

  Done:
    - Added permission_sharing + permission_transfers to
      RealtimeTable union + tableMapping in realtime-manager.ts
    - ALTER PUBLICATION supabase_realtime ADD TABLE for both
    - useEffect in AccessProvider opens per-user postgres_changes
      channel filtered by grantee_user_id=eq.<me>. On any event:
      loadAccessProfile + dispatch permissions_updated +
      sidebar_refresh events. Cleanup on unmount.

  Result: granting/revoking a share updates the grantee's open
  tab within ~1s. No manual reload.

Verify:
  1. Accountant in tist opens /customers -> empty list
  2. Owner shares 1 customer from staff -> within 1s, accountant
     sees 'العملاء' in sidebar + the 1 shared customer
  3. Revoke -> within 1s, page disappears from sidebar
  4. Owner/admin still see all 3 customers (company visibility)
  5. Staff still see own + shared (own visibility)

Phase C remaining:
  v3.75.0 - position hierarchy
  v3.76.0 - 'who can access X' reporting

Files:
  DB migration: v3_74_0_resource_aware_visibility_plus_realtime
  Modified: lib/realtime-manager.ts
  Modified: lib/access-context.tsx
  Modified: lib/version.ts (3.73.3 -> 3.74.0)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.0 pushed" -ForegroundColor Green
}
