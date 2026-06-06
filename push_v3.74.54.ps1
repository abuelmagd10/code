# v3.74.54 - notify source warehouse on direct (non-approval) transfer creation
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.54"') {
    Write-Host "+ APP_VERSION = 3.74.54" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.54" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.54]')) {
    Write-Host "+ CHANGELOG 3.74.54" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.54" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/inventory-transfer-notification.service.ts" -Raw
if ($svc -match 'v3\.74\.54') {
    Write-Host "+ v3.74.54 marker present in service" -ForegroundColor Green
} else { Write-Host "X v3.74.54 marker missing in service" -ForegroundColor Red; exit 1 }
if ($svc -match 'created_source_warehouse_notified') {
    Write-Host "+ created_source_warehouse_notified event present" -ForegroundColor Green
} else { Write-Host "X created_source_warehouse_notified event missing" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/inventory-transfers/[id]/notifications/route.ts" -Raw
if ($route -match 'v3\.74\.54' -and $route -match 'sourceWarehouseId:\s*\(transfer as any\)\.source_warehouse_id') {
    Write-Host "+ destination_request_created passes source_warehouse_id" -ForegroundColor Green
} else { Write-Host "X destination_request_created does not pass source_warehouse_id" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(inventory-transfers): v3.74.54 - notify source warehouse on direct transfer creation

v3.74.51 added a 'Transfer Approved - Dispatch Required' notification
to the source store_manager when management approves an accountant-
submitted transfer request. But that only covered one of the two
creation paths.

When Owner/Admin/Manager creates a transfer directly, the request
skips the approval cycle entirely - the row is inserted with
status='pending' (already-approved) and the page fires
destination_request_created, which until now only notified the
destination warehouse. The source store_manager - the person who has
to pull the goods - was never told. Same blind spot as v3.74.51,
different entry point.

Fix:
- notifyDestinationRequestCreated now sends two notifications:
  destination (existing) + source warehouse (new) via the same
  dispatchSourceWarehouseNotification helper used in v3.74.51. The
  source call is wrapped in try/catch so it can never break the
  destination notification.
- New event_action discriminator created_source_warehouse_notified
  (parallel to approved_source_warehouse_notified from v3.74.51) so
  the two scenarios stay traceable in notifications.event_key.
- The notifications route now passes source_warehouse_id on the
  destination_request_created case so the service can resolve
  recipients.

Testing:
- As Admin, create a new transfer.
- Destination store_manager gets 'New Stock Transfer Request' as
  before.
- NEW: source store_manager gets 'طَلَب نَقل يَنتَظِر بَدء إِرسال'.
- Row also shows up on /inventory/dispatch-approvals for the source
  store_manager (the page already reads status='pending').

Files changed:
- lib/services/inventory-transfer-notification.service.ts
- app/api/inventory-transfers/[id]/notifications/route.ts
- lib/version.ts (APP_VERSION = 3.74.54)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.54 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.53.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.53.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.53.ps1)" -ForegroundColor DarkGray
    }
}
