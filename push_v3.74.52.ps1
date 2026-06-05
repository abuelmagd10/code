# v3.74.52 hotfix - source warehouse manager can open the transfer they were notified about
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.52"') {
    Write-Host "+ APP_VERSION = 3.74.52" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.52" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.52]')) {
    Write-Host "+ CHANGELOG 3.74.52" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.52" -ForegroundColor Red; exit 1 }

$det = Get-Content -LiteralPath "app/inventory-transfers/[id]/page.tsx" -Raw
if ($det -match 'v3\.74\.52') {
    Write-Host "+ v3.74.52 marker present in detail page" -ForegroundColor Green
} else { Write-Host "X v3.74.52 marker missing in detail page" -ForegroundColor Red; exit 1 }
if ($det -match 'isSourceMatch' -and $det -match 'isDestMatch') {
    Write-Host "+ source/destination OR guard present in detail page" -ForegroundColor Green
} else { Write-Host "X source/destination OR guard missing" -ForegroundColor Red; exit 1 }

$lst = Get-Content -LiteralPath "app/inventory-transfers/page.tsx" -Raw
if ($lst -match 'v3\.74\.52') {
    Write-Host "+ v3.74.52 marker present in list page" -ForegroundColor Green
} else { Write-Host "X v3.74.52 marker missing in list page" -ForegroundColor Red; exit 1 }
if ($lst -match 'source_warehouse_id\.eq' -and $lst -match 'destination_warehouse_id\.eq') {
    Write-Host "+ list filter OR'd on source + destination" -ForegroundColor Green
} else { Write-Host "X list filter not OR'd" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(inventory-transfers): v3.74.52 - source warehouse manager can open the transfer they were notified about

After v3.74.51, store_managers in the source warehouse got the
'Transfer Approved - Dispatch Required' notification and the
transfer showed up on /inventory/dispatch-approvals - but clicking
through to /inventory-transfers/[id] rejected them with 'You can
only view transfers to your warehouse in your branch'. The detail
page's role check still only allowed store_managers whose warehouse
matched the destination, never the source - the exact gap v3.74.51
was supposed to close. Same issue on the /inventory-transfers list:
the row filter only matched destination_warehouse_id, so an approved
transfer leaving the source manager's warehouse never appeared in
their list either.

Fix:
- app/inventory-transfers/[id]/page.tsx - replaced the
  destination-only check with an OR. A store_manager is allowed in
  if their warehouse+branch is either the source OR the destination.
  Both are legitimate: destination to receive, source to start
  dispatch (v3.74.51).
- app/inventory-transfers/page.tsx - the row filter is now an OR'd
  PostgREST and(...) clause that matches transfers where the user's
  warehouse+branch is either the source or the destination pair.
- Updated the error message text accordingly.

Files changed:
- app/inventory-transfers/[id]/page.tsx
- app/inventory-transfers/page.tsx
- lib/version.ts (APP_VERSION = 3.74.52)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.52 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.51.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.51.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.51.ps1)" -ForegroundColor DarkGray
    }
}
