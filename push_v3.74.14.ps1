# v3.74.14 - sales_return_requests sidebar entry under Warehouse group
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.14"') { Write-Host "+ APP_VERSION = 3.74.14" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.14" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.14\]' -and $cl -match 'sales_return_requests' -and $cl -match 'موافقات مرتجعات المبيعات') {
    Write-Host "+ CHANGELOG entry for 3.74.14 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.14 entry" -ForegroundColor Red; exit 1 }

# access-context defaults updated for the 3 roles
$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
$accCount = ([regex]::Matches($ac, "'sales_return_requests'")).Count
if ($accCount -ge 3) {
    Write-Host "+ access-context lists sales_return_requests in 3+ roles" -ForegroundColor Green
} else { Write-Host "X access-context missing sales_return_requests in some roles ($accCount)" -ForegroundColor Red; exit 1 }

# Sidebar - new state + menu item + resource matcher
# Note: file in git is lowercase `sidebar.tsx`. Windows is case-insensitive so
# either casing reads the same file, but git tracks the lowercase name.
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match 'pendingSalesReturnRequestsCount') {
    Write-Host "+ Sidebar has pendingSalesReturnRequestsCount state" -ForegroundColor Green
} else { Write-Host "X Sidebar missing state" -ForegroundColor Red; exit 1 }

if ($sb -match '/sales-return-requests' -and $sb -match 'موافقات مرتجعات المبيعات') {
    Write-Host "+ Sidebar has menu entry under Warehouse group" -ForegroundColor Green
} else { Write-Host "X Sidebar missing menu entry" -ForegroundColor Red; exit 1 }

if ($sb -match "href\.includes\('/sales-return-requests'\)\) return 'sales_return_requests'") {
    Write-Host "+ Resource matcher entry added" -ForegroundColor Green
} else { Write-Host "X Resource matcher missing" -ForegroundColor Red; exit 1 }

# Refresh callback wired
if ($sb -match 'refreshSalesReturnRequestsCount') {
    Write-Host "+ Refresh callback wired (polling + on navigation)" -ForegroundColor Green
} else { Write-Host "X Refresh callback missing" -ForegroundColor Red; exit 1 }

# New API endpoint exists
if (Test-Path -LiteralPath "app/api/sales-return-requests/pending-count/route.ts") {
    Write-Host "+ pending-count endpoint created" -ForegroundColor Green
} else { Write-Host "X pending-count endpoint missing" -ForegroundColor Red; exit 1 }

$pc = Get-Content -LiteralPath "app/api/sales-return-requests/pending-count/route.ts" -Raw
if ($pc -match 'SALES_RETURN_LEVEL1_APPROVER_ROLES' -and $pc -match 'SALES_RETURN_WAREHOUSE_ROLES') {
    Write-Host "+ pending-count uses role allowlists" -ForegroundColor Green
} else { Write-Host "X pending-count missing role logic" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        lib/access-context.tsx `
        components/sidebar.tsx `
        components/SidebarLayoutProvider.tsx `
        "app/api/sales-return-requests/pending-count/route.ts" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(sidebar): v3.74.14 - sales_return_requests entry under Warehouse group

After v3.74.13 fixed the 403, Ahmed reported the deeper UX gap:
/sales-return-requests is missing from the sidebar entirely.
Approvers could only reach it via a notification deep-link or
direct URL. They had no proactive way to check pending returns.

The historical list /sales-returns is in the sidebar under Sales,
but that is the COMPLETED returns log - not the workflow page.

Ahmed picked option (b): under the Inventory group, next to
'mwafaqat al-irsal' (dispatch approvals). Both are warehouse-
workflow pages; store_manager already has Inventory as their
primary group, so the entry appears naturally for them.

Four layers:

  1) DB migration v3_74_14_sales_return_requests_resource:
     Extended seed_default_role_permissions to add the resource
     for accountant (write), store_manager (write), and the
     manager union (read-only per Ahmed spec). Backfilled every
     existing company. Verified counts:
       accountant     17 -> 18 resources
       store_manager  6  -> 7
       manager        25 -> 26

  2) lib/access-context.tsx fallback list - added the resource
     to accountant, store_manager, manager default arrays. Only
     matters for the last-resort path; for new companies the
     DB-authoritative branch wins.

  3) components/Sidebar.tsx:
       - new state pendingSalesReturnRequestsCount
       - refreshSalesReturnRequestsCount callback gated by a
         7-role allowlist (level-1 + warehouse roles)
       - polling every 30s, refresh on hydration + navigation
         (mirrors pendingDispatchCount exactly)
       - menu item under Inventory, right after Dispatch Approvals
       - resource matcher /sales-return-requests added BEFORE the
         existing /sales-returns check so the more specific path
         wins

  4) GET /api/sales-return-requests/pending-count:
       Level-1 approvers (owner/admin/general_manager/manager/
       accountant) -> count where status = pending_level_1,
       branch-scoped for manager/accountant.
       Warehouse approvers (store_manager/warehouse_manager) ->
       count where status = pending_warehouse, scoped first to
       warehouse_id then to branch_id.
       Anyone outside the workflow -> { count: 0 }.
       No requirePermission - same workflow-scoped auth shape as
       the list endpoint after v3.74.13.

Files:
  DB:     v3_74_14_sales_return_requests_resource
  New:    app/api/sales-return-requests/pending-count/route.ts
  Modified:
    lib/access-context.tsx
    components/Sidebar.tsx
    lib/version.ts (3.74.13 -> 3.74.14)
    CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.14 pushed" -ForegroundColor Green
}
