# v3.55.13 - Full visual alignment of /estimates filter UI with /sales-orders
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

$checks = @(
    @{ p = "FilterContainer";                         m = "FilterContainer imported + used" },
    @{ p = "BranchFilter";                            m = "BranchFilter component imported" },
    @{ p = "useBranchFilter";                         m = "useBranchFilter hook" },
    @{ p = "UserCheck";                               m = "UserCheck icon for employee row" },
    @{ p = "filterProducts, setFilterProducts";       m = "Products MultiSelect state" },
    @{ p = "itemsByEstimate";                         m = "estimate_id -> product_ids index" },
    @{ p = "setEmployees\(employeesList\)";           m = "Employees enriched with user_profiles" },
    @{ p = "employeeSearchQuery";                     m = "Employee dropdown search" },
    @{ p = "canViewAllEstimates";                     m = "Privileged role flag" },
    @{ p = "branchFilter\.selectedBranchId";          m = "BranchFilter wired into query" },
    @{ p = "فلترة بالمنتجات";                          m = "Products filter Arabic placeholder" },
    @{ p = "فلترة حسب الموظف:";                       m = "Employee row Arabic header" },
    @{ p = "عَرض سعرى";                                m = "Bottom counter Arabic" },
    @{ p = "no applyDataVisibilityFilter";            m = "Reload uses explicit governance (no warehouse_id filter)" }
)

# Confirm applyDataVisibilityFilter is NOT used on estimates queries any more
$badPattern = 'applyDataVisibilityFilter\(estReload'
if ($est -match $badPattern) {
    Write-Host "  X estReload still uses applyDataVisibilityFilter (will cause 400)" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  + estReload no longer uses the buggy helper" -ForegroundColor Green
}

foreach ($c in $checks) {
    if ($est -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

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
git commit -m "feat(estimates): full visual alignment of filter UI with /sales-orders

Changes in app/estimates/page.tsx:

Imports added:
- FilterContainer (from @/components/ui/filter-container)
- BranchFilter + useBranchFilter
- UserCheck + X icons

State added:
- Employee type and employees[] list (joined with user_profiles)
- employeeSearchQuery for in-dropdown search
- branchFilter hook + selectedBranchId integration
- isPending + startTransition for smooth UI
- filterProducts (string[]) for product MultiSelect
- itemsByEstimate index (estimate_id -> product_ids)

Load logic:
- Estimates query honors branchFilter.selectedBranchId
- estimate_items loaded as a product-id index per estimate
- Employees enriched from user_profiles for blue Employee row
- useEffect deps include branchFilter.selectedBranchId

Filter UI (mirrors /sales-orders structure):
- FilterContainer (collapsible) with active count + Clear button
- Purple BranchFilter row (privileged only - auto-hides)
- Blue Employee row with UserCheck icon + internal search + Clear
- 5-column grid: Search(2 cols) + Status + Customer + Products + Dates
- Bottom result counter

Governance preserved across all filters (no change to delete/link
governance from v3.55.12)." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.13 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  Open /estimates and /sales-orders side by side" -ForegroundColor White
    Write-Host "  -> Filter sections should look identical:" -ForegroundColor White
    Write-Host "     * FilterContainer with active count badge + clear button" -ForegroundColor White
    Write-Host "     * Purple BranchFilter row (privileged only)" -ForegroundColor White
    Write-Host "     * Blue Employee row with UserCheck icon (privileged only)" -ForegroundColor White
    Write-Host "     * 5-column grid: search(2) + status + customer + products + dates" -ForegroundColor White
    Write-Host "     * Bottom result counter" -ForegroundColor White
}
