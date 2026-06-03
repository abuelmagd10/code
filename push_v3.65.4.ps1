# v3.65.4 - Permissions cleanup + hr_officer role end-to-end
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.65.4"') { Write-Host "+ APP_VERSION = 3.65.4" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.65.4" -ForegroundColor Red; exit 1 }

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match 'hr_officer' -and $sb -match 'مسؤول الموارد البشرية') {
    Write-Host "+ sidebar: hr_officer Arabic label present" -ForegroundColor Green
} else { Write-Host "X sidebar hr_officer label missing" -ForegroundColor Red; exit 1 }

$inv = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
if ($inv -match 'hr_officer' -and $inv -match 'مسؤول الموارد البشرية') {
    Write-Host "+ send-invite: hr_officer email mapping present" -ForegroundColor Green
} else { Write-Host "X send-invite hr_officer mapping missing" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
$hrCount = ([regex]::Matches($usr, 'hr_officer')).Count
if ($hrCount -ge 5) {
    Write-Host "+ /settings/users: hr_officer appears $hrCount times (dropdowns + roleLabels + defaults)" -ForegroundColor Green
} else { Write-Host "X /settings/users: hr_officer only $hrCount times (expected >= 5)" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts components/sidebar.tsx app/api/send-invite/route.ts app/settings/users/page.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(roles): v3.65.4 - permissions cleanup + hr_officer role end-to-end

Permissions cleanup (applied as DB migration, not in code):
  - viewer: removed 5 admin resources (users, permission_sharing,
    permission_transfers, role_permissions, company_settings).
    Least-privilege: a view-only account had no business seeing
    the governance surface.
  - manager: removed 4 permission-management resources
    (permission_sharing, permission_transfers, role_permissions,
    users). Separation-of-duties: branch managers should not be
    able to grant themselves or their team broader access.
  - staff / booking_officer / manufacturing_officer / store_manager /
    accountant: set dashboard + reports can_access=true (rows
    existed, updated). Without this they hit no-access on login.
  - purchasing_officer: added reports; removed 6 accounting-only
    resources (accounting_periods, annual_closing, expenses,
    sent_invoice_returns, journal_entries, chart_of_accounts).

New hr_officer role (six-place change pattern from v3.65.3 lesson):
  1. CHECK constraints extended on company_invitations,
     company_members, company_role_permissions_role_check_v2
  2. Seeded 7 permissions for company tist: dashboard, reports,
     employees, payroll, attendance, branches, cost_centers
  3. components/sidebar.tsx - Arabic label mapping
  4. app/api/send-invite/route.ts - email roleName mapping
  5. app/settings/users/page.tsx - 3 SelectItem dropdowns
  6. roleLabels + defaultSidebarResourcesByRole entries

Final per-role permission counts on company tist:
  owner 39, admin 39, manager 33, viewer 34, accountant 24,
  purchasing_officer 20, store_manager 10, staff 9,
  booking_officer 9, manufacturing_officer 9, hr_officer 7.

Deferred to v3.66.0:
  - seed_default_permissions(company_id) so new companies get
    all 11 roles auto-seeded
  - branch-scoped RLS audit across 50+ tables (Layer 3)
  - manufacturing-specific resources (Layer 4)

Files:
  Modified: lib/version.ts (3.65.3 -> 3.65.4)
  Modified: components/sidebar.tsx
  Modified: app/api/send-invite/route.ts
  Modified: app/settings/users/page.tsx
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.65.4 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: wait for Vercel deploy, then verify:" -ForegroundColor Cyan
    Write-Host "  1. Invite a user as hr_officer -> email shows 'مسؤول الموارد البشرية'" -ForegroundColor Gray
    Write-Host "  2. Accept -> no infinite loop, sidebar shows HR role label" -ForegroundColor Gray
    Write-Host "  3. Old viewer no longer sees Users/Settings pages" -ForegroundColor Gray
    Write-Host "  4. Old manager no longer sees role-permissions pages" -ForegroundColor Gray
}
