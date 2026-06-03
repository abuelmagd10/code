# v3.55.8 — Align /estimates filters with /sales-orders (MultiSelect + Employee filter)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "import \{ MultiSelect \} from") {
    Write-Host "  ✓ MultiSelect imported" -ForegroundColor Green
} else { Write-Host "  ✗ MultiSelect import missing" -ForegroundColor Red; exit 1 }

if ($est -match "filterStatuses, setFilterStatuses\]\s*=\s*useState<string\[\]>") {
    Write-Host "  ✓ filterStatuses is string[] (MultiSelect)" -ForegroundColor Green
} else { Write-Host "  ✗ filterStatuses still single-value" -ForegroundColor Red; exit 1 }

if ($est -match "filterCustomers, setFilterCustomers\]\s*=\s*useState<string\[\]>") {
    Write-Host "  ✓ filterCustomers is string[] (MultiSelect)" -ForegroundColor Green
} else { Write-Host "  ✗ filterCustomers still single-value" -ForegroundColor Red; exit 1 }

if ($est -match "filterEmployeeId") {
    Write-Host "  ✓ filterEmployeeId added" -ForegroundColor Green
} else { Write-Host "  ✗ filterEmployeeId missing" -ForegroundColor Red; exit 1 }

if ($est -match "الموظف المُنشئ") {
    Write-Host "  ✓ Employee filter UI label present" -ForegroundColor Green
} else { Write-Host "  ✗ Employee filter label missing" -ForegroundColor Red; exit 1 }

if ($est -match "Load company members for the .Employee. filter") {
    Write-Host "  ✓ Members loaded for privileged roles" -ForegroundColor Green
} else { Write-Host "  ✗ Members load logic missing" -ForegroundColor Red; exit 1 }

if ($est -match "filterCustomers\.length > 0 && !filterCustomers\.includes") {
    Write-Host "  ✓ MultiSelect customer filter applied in filteredEstimates" -ForegroundColor Green
} else { Write-Host "  ✗ MultiSelect filter logic missing in filteredEstimates" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(estimates): align filters with /sales-orders (MultiSelect status+customer + employee filter)

User-reported governance/UX gap:
- /estimates was using single Select for status + customer filters
- /sales-orders uses MultiSelect for both (better UX)
- /estimates had no 'employee creator' filter for privileged roles

Changes in app/estimates/page.tsx:
- Import MultiSelect from @/components/ui/multi-select
- State migrations:
  * filterStatus (string)     -> filterStatuses (string[])
  * filterCustomerId (string) -> filterCustomers (string[])
  * + filterEmployeeId (string, default 'all') for privileged roles
- Members state: loaded only for owner/admin/general_manager
- UI: replaced 2 single Selects with 2 MultiSelects
- UI: added 'Employee creator' Select (visible only to privileged roles)
- Updated filteredEstimates, activeFilterCount, clearFilters

Governance preserved (no leak):
- Customers MultiSelect uses the same governed 'customers' state
  (already filtered in v3.55.7 — staff sees only their own customers)
- Employee filter is hidden from non-privileged roles
- filterEmployeeId only matches when set (default 'all' = no filter)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.8 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /estimates as owner   → see status MultiSelect + customer MultiSelect + employee filter" -ForegroundColor White
    Write-Host "  /estimates as staff   → see status + customer MultiSelect (only his customers) — no employee filter" -ForegroundColor White
    Write-Host "  Pattern identical to /sales-orders" -ForegroundColor White
}
