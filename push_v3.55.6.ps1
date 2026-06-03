# v3.55.6 — Creator-filter governance applied to sales_orders + all governance APIs
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$mw = Get-Content "lib\governance-middleware.ts" -Raw
$so = Get-Content "app\api\sales-orders\route.ts" -Raw

if ($mw -match "filterByCreator: boolean") {
    Write-Host "  ✓ GovernanceContext has filterByCreator field" -ForegroundColor Green
} else { Write-Host "  ✗ filterByCreator field missing" -ForegroundColor Red; exit 1 }

if ($mw -match "userId: string") {
    Write-Host "  ✓ GovernanceContext has userId field" -ForegroundColor Green
} else { Write-Host "  ✗ userId field missing" -ForegroundColor Red; exit 1 }

if ($mw -match "case 'sales':") {
    Write-Host "  ✓ 'sales' role explicitly handled (creator-level)" -ForegroundColor Green
} else { Write-Host "  ✗ 'sales' role not added to creator-level cases" -ForegroundColor Red; exit 1 }

if ($mw -match "context\.filterByCreator && context\.userId") {
    Write-Host "  ✓ applyGovernanceFilters enforces creator filter" -ForegroundColor Green
} else { Write-Host "  ✗ creator filter logic missing in applyGovernanceFilters" -ForegroundColor Red; exit 1 }

if ($so -match "created_by_user_id = governance\.userId|orderDataToInsert\.created_by_user_id = governance\.userId") {
    Write-Host "  ✓ sales_orders POST auto-fills created_by_user_id" -ForegroundColor Green
} else { Write-Host "  ✗ created_by_user_id auto-fill missing in POST" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add lib/governance-middleware.ts app/api/sales-orders/route.ts CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(governance): apply creator-filter to staff/sales/employee on all governance APIs

Bug:
Roles staff/sales/employee were seeing all branch records, not just
their own — contrary to /customers + /estimates behavior. Comment in
governance-middleware said 'staff sees only their data' but only
branch_id was filtered, not created_by_user_id.

Fixes in lib/governance-middleware.ts:
- GovernanceContext: + userId: string, + filterByCreator: boolean
- buildGovernanceContext: receives userId, sets filterByCreator=true
  for staff/employee/sales (sales was missing from the case branch)
- applyGovernanceFilters: adds .eq('created_by_user_id', userId)
  when filterByCreator && userId

Fix in app/api/sales-orders/route.ts:
- POST: auto-fills orderDataToInsert.created_by_user_id from
  governance.userId so the later filter has something to match

DB migration (already applied via Supabase MCP):
- ALTER TABLE customer_debit_notes/payments/sales_returns/vendor_credits
  ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id)
- 4 indexes

Behavior now matches /customers + /estimates:
- owner/admin/general_manager: all company records
- manager/accountant: branch-level visibility
- staff/sales/employee: creator-only visibility

Affects all APIs using applyGovernanceFilters:
bills, customer-debit-notes, customers, payments, purchase-orders,
sales-orders, sales-returns, suppliers, vendor-credits, warehouses." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.6 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test as 'staff' or 'sales' role:" -ForegroundColor Cyan
    Write-Host "  /sales-orders  → only their own + 👨‍💼 notice" -ForegroundColor White
    Write-Host "  /customers     → still works (already had its own filter)" -ForegroundColor White
    Write-Host "  /estimates     → still works (already filtered in v3.55.5)" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Regression watch — these APIs now ALSO apply creator filter:" -ForegroundColor Yellow
    Write-Host "    bills, payments, purchase-orders, sales-returns, vendor-credits, etc." -ForegroundColor White
}
