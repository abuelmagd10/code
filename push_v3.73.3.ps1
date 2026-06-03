# v3.73.3 hotfix - Inbound shares expand grantee's sidebar
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.73.3"') { Write-Host "+ APP_VERSION = 3.73.3" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.73.3" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.73.3\]') { Write-Host "+ CHANGELOG entry for 3.73.3 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.73.3 entry" -ForegroundColor Red; exit 1 }

$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
if ($ac -match "SHAREABLE_RESOURCES" -and $ac -match "inboundShares") {
    Write-Host "+ access-context: inbound shares expansion present" -ForegroundColor Green
} else { Write-Host "X access-context inbound shares wiring missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(access): v3.73.3 - inbound shares expand grantee's sidebar

Ahmed tested: A shared customers with B. RLS lets B read A's
records (v3.71.0 RLS-enforced sharing works at data layer) but
B's sidebar didn't show 'العملاء' because allowed_pages was
computed only from company_role_permissions for B's role, never
consulting permission_sharing.

Fix:
  In lib/access-context.tsx, after allowed_pages is built from
  role permissions, query permission_sharing for active
  non-expired rows where user is grantee. For each share:
    - resource_type='all' -> add customers, estimates,
      sales_orders, bookings
    - specific resource_type -> add just that one
  Duplicates skipped. Best-effort: if query fails, user keeps
  role-based pages.

Caveat:
  Update applies on next AccessContext rebuild (page reload).
  No realtime push to grantee yet - admin must tell grantee to
  refresh after granting share. Realtime notification is future
  polish.

Verify:
  1. Admin shares A->B resource=customers
  2. B refreshes browser
  3. B's sidebar shows العملاء under المبيعات group
  4. B clicks /customers -> sees A's records (RLS already worked)
  5. resource=all -> all 4 shareable resources added
  6. Expire share -> B refreshes -> bonus items disappear

Files:
  Modified: lib/access-context.tsx
  Modified: lib/version.ts (3.73.2 -> 3.73.3)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.73.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After deploy: ask the grantee user to hard-refresh their browser" -ForegroundColor Cyan
    Write-Host "(Ctrl+Shift+R) to see the newly shared pages in sidebar." -ForegroundColor Cyan
}
