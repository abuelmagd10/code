# v3.74.4 hotfix - dispatch-approvals row data fix
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.4"') { Write-Host "+ APP_VERSION = 3.74.4" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.4" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.4\]') { Write-Host "+ CHANGELOG entry for 3.74.4 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.4 entry" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw

# The SELECT must include warehouses + branches joins now
if ($pg -match 'warehouses \(name\)' -and $pg -match 'branches \(name\)') {
    Write-Host "+ SELECT pulls warehouses + branches joins" -ForegroundColor Green
} else { Write-Host "X SELECT missing warehouse/branch joins" -ForegroundColor Red; exit 1 }

# The old hardcoded warehouse: "-" must be gone
if ($pg -notmatch 'warehouse: "-"') {
    Write-Host "+ hardcoded warehouse: '-' removed" -ForegroundColor Green
} else { Write-Host "X hardcoded warehouse: '-' still present" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/inventory/dispatch-approvals/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(approvals): v3.74.4 - dispatch-approvals pending rows missing warehouse + branch

Ahmed reported the pending table at /inventory/dispatch-approvals
showed columns 'النوع / الرقم المرجعي / التاريخ / العميل /
المستودع / شركة الشحن / الفرع' but rows had no warehouse and
either shipping or just dashes - never the branch.

Root cause - two bugs in the pending load only (history was fine):
  1. SELECT on invoices didn't pull warehouses(name) or
     branches(name) joins
  2. Row builder hardcoded warehouse: '-' and only filled extra
     from shipping_provider, so invoices with no shipper yet
     showed empty dashes everywhere

DB schema is fine - invoices.warehouse_id and invoices.branch_id
have been NOT NULL since v3.66.0 governance. The data exists;
the page just wasn't reading it.

Fix:
  - SELECT now pulls warehouse_id, branch_id, warehouses(name),
    branches(name) alongside the existing customer + shipping
    joins.
  - Row builder reads the real values:
      warehouse = inv.warehouses?.name ?? '-'
      extra     = shipping?.provider_name || branches?.name || '-'
    (shipping preferred when set; falls back to branch so the
    column always carries something useful.)

Files:
  Modified: app/inventory/dispatch-approvals/page.tsx
  Modified: lib/version.ts (3.74.3 -> 3.74.4)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.4 pushed" -ForegroundColor Green
}
