# v3.74.55 - sidebar inventory_transfer badge counts per status (pending/pending_approval/in_transit)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.55"') {
    Write-Host "+ APP_VERSION = 3.74.55" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.55" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.55]')) {
    Write-Host "+ CHANGELOG 3.74.55" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.55" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(sidebar-badge): v3.74.55 - inventory_transfer badge survives until receipt

The red number next to 'Inventory Transfer' in the sidebar disappeared
the moment a transfer flipped to in_transit, but the destination
store_manager still owed an action - press 'Approve Receipt'. The
badge should stay until the transfer is received.

Root cause in get_user_approval_badges:
- Counted only status IN ('pending','pending_approval') - in_transit
  was missing.
- Scope filter was hard-coded to source_warehouse_id = my_warehouse,
  so destination-side workload was never visible.
- Manager/accountant approvers weren't included even though they
  approve pending_approval.

Fix - recreated the function with per-status counting:
- pending_approval: owner/admin/general_manager + manager/accountant
  scoped to source-or-destination branch.
- pending: owner/admin/general_manager + store/warehouse manager at
  source warehouse.
- in_transit: owner/admin/general_manager + store/warehouse manager
  at destination warehouse.

Rest of get_user_approval_badges preserved byte-for-byte. Only the
inventory_transfer block changed.

Files changed:
- DB function public.get_user_approval_badges (migration
  v3_74_55_badge_transfer_per_status).
- lib/version.ts (APP_VERSION = 3.74.55).

Testing:
1. Source store_manager: 0 before approval, 1 after approval.
2. Press Start Transfer (in_transit). Source 0, destination 1.
3. Press Approve Receipt (received). Destination 0.
4. Owner/admin still see company-wide total across all 3 statuses.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.55 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.54.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.54.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.54.ps1)" -ForegroundColor DarkGray
    }
}
