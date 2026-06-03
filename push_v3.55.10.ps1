# v3.55.10 - Hotfix: 400 on convertToSO (sales_orders requires warehouse_id NOT NULL)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "sales_orders requires branch_id, cost_center_id, warehouse_id NOT NULL") {
    Write-Host "  + convertToSO comment marker present" -ForegroundColor Green
} else { Write-Host "  X comment marker missing" -ForegroundColor Red; exit 1 }

if ($est -match "default_warehouse_id, default_cost_center_id") {
    Write-Host "  + Branch defaults fetch present" -ForegroundColor Green
} else { Write-Host "  X Branch defaults fetch missing" -ForegroundColor Red; exit 1 }

if ($est -match "warehouse_id: warehouseId") {
    Write-Host "  + warehouse_id is now included in soPayload" -ForegroundColor Green
} else { Write-Host "  X warehouse_id missing from soPayload" -ForegroundColor Red; exit 1 }

if ($est -match "الفرع لا يحتوى على مخزن") {
    Write-Host "  + Friendly error message in Arabic" -ForegroundColor Green
} else { Write-Host "  X Friendly error missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(estimates): convertToSO 400 - sales_orders requires warehouse_id NOT NULL

Bug:
Converting an estimate to a sales order returned
POST /rest/v1/sales_orders 400 (Bad Request).

Root cause:
sales_orders has 3 NOT NULL columns required for INSERT:
branch_id, cost_center_id, warehouse_id. The convertToSO function
in app/estimates/page.tsx was only sending branch_id + cost_center_id
- warehouse_id was missing entirely. PostgreSQL rejected the insert
with a NOT NULL violation (which Supabase reports as 400).

Fix:
convertToSO now resolves all 3 columns in priority order:
1. estimate fields (branch_id, cost_center_id from source)
2. userContext (branch_id, cost_center_id, warehouse_id)
3. branches table defaults (default_warehouse_id, default_cost_center_id)

If after all 3 fallbacks any value is still null, shows a friendly
Arabic error message instead of letting the 400 happen silently.

Governance preserved:
- created_by_user_id still set from auth
- branch_id inherited from source estimate
- The new branches query is a simple lookup (no policy concern)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.10 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  /estimates -> click 'Convert to Sales Order' on an estimate" -ForegroundColor White
    Write-Host "  -> should succeed (no more 400)" -ForegroundColor White
    Write-Host "  -> SO appears in /sales-orders with branch + warehouse + cost_center filled" -ForegroundColor White
}
