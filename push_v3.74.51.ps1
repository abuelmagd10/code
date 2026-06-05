# v3.74.51 - notify source warehouse on transfer approval + show transfer rows in /inventory/dispatch-approvals + allow store_manager to start dispatch
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.51"') {
    Write-Host "+ APP_VERSION = 3.74.51" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.51" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.51]')) {
    Write-Host "+ CHANGELOG 3.74.51" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.51" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/inventory-transfer-notification.service.ts" -Raw
if ($svc -match 'dispatchSourceWarehouseNotification') {
    Write-Host "+ dispatchSourceWarehouseNotification helper present" -ForegroundColor Green
} else { Write-Host "X dispatchSourceWarehouseNotification missing" -ForegroundColor Red; exit 1 }
if ($svc -match 'sourceWarehouseId\?:\s*string\s*\|\s*null') {
    Write-Host "+ sourceWarehouseId added to base params" -ForegroundColor Green
} else { Write-Host "X sourceWarehouseId missing from base params" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/inventory-transfers/[id]/notifications/route.ts" -Raw
if ($route -match 'source_warehouse_id') {
    Write-Host "+ route selects source_warehouse_id" -ForegroundColor Green
} else { Write-Host "X route missing source_warehouse_id" -ForegroundColor Red; exit 1 }

$da = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw
if ($da -match 'v3\.74\.51') {
    Write-Host "+ v3.74.51 marker present in dispatch-approvals" -ForegroundColor Green
} else { Write-Host "X v3.74.51 marker missing in dispatch-approvals" -ForegroundColor Red; exit 1 }
if ($da -match '"transfer"') {
    Write-Host "+ transfer type added in dispatch-approvals" -ForegroundColor Green
} else { Write-Host "X transfer type missing in dispatch-approvals" -ForegroundColor Red; exit 1 }
if ($da -match 'transferCount') {
    Write-Host "+ transferCount filter chip present" -ForegroundColor Green
} else { Write-Host "X transferCount missing" -ForegroundColor Red; exit 1 }

$dt = Get-Content -LiteralPath "app/inventory-transfers/[id]/page.tsx" -Raw
if ($dt -match 'canStartDispatch') {
    Write-Host "+ canStartDispatch gate present" -ForegroundColor Green
} else { Write-Host "X canStartDispatch missing" -ForegroundColor Red; exit 1 }
if ($dt -match 'isSourceWarehouseManager') {
    Write-Host "+ isSourceWarehouseManager check present" -ForegroundColor Green
} else { Write-Host "X isSourceWarehouseManager missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(inventory-transfers): v3.74.51 - hand off approved transfer to source warehouse manager

When management approved a stock transfer request, the workflow handed
off invisibly. The source-warehouse manager - the person who has to
pull the goods and start the dispatch - got no notification, the
approved transfer never showed up on their /inventory/dispatch-approvals
queue, and they couldn't press Start Transfer on the detail page
because that button was gated to owner/admin/manager only. Requests
sat idle in pending until someone with elevated permission noticed.

Fix 1 - notification:
- Added sourceWarehouseId to InventoryTransferNotificationBaseParams.
- New private helper dispatchSourceWarehouseNotification, mirroring
  dispatchDestinationWarehouseNotification.
- notifyApproved now sends two notifications: one to the accountant
  who created it (existing), one to store_managers in the source
  warehouse (new), wrapped in try/catch so the source failure can't
  block the creator notification.
- The notifications route now selects source_warehouse_id from the
  transfer row and passes it through to notifyApproved.

Fix 2 - dispatch-approvals visibility:
- ApprovalType and TypeFilter widened from sales|manufacturing to
  sales|manufacturing|transfer.
- loadAll() now fetches inventory_transfers status='pending' with
  FK-disambiguated joins to source/destination warehouses and branches,
  plus transfer_items for product/qty rollups.
- store_managers see only transfers whose source matches their own
  warehouse + branch. Owner/admin/manager/GM see all approved
  transfers (same governance pattern used elsewhere on the page).
- Each row renders a single Start Dispatch button that routes to
  /inventory-transfers/[id] where the dispatch flow already lives.
- New purple ArrowLeftRight icon distinguishes transfer rows from
  invoices and manufacturing.
- Added a fourth filter chip with a transferCount.

Fix 3 - Start Transfer button gate:
- Replaced the canManage-only gate on Start Transfer with a new
  canStartDispatch = (canManage || isSourceWarehouseManager) check.
- isSourceWarehouseManager fires when the user is a store_manager
  whose own warehouse equals the transfer's source_warehouse_id and
  whose own branch equals the transfer's source_branch_id.

Files changed:
- lib/services/inventory-transfer-notification.service.ts
- app/api/inventory-transfers/[id]/notifications/route.ts
- app/inventory/dispatch-approvals/page.tsx
- app/inventory-transfers/[id]/page.tsx
- lib/version.ts (APP_VERSION = 3.74.51)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.51 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.50.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.50.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.50.ps1)" -ForegroundColor DarkGray
    }
}
