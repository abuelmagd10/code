# v3.55.7 — Hotfix: governance leak in customer dropdown inside /estimates
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "Customers — mirror /customers page governance exactly") {
    Write-Host "  ✓ customer dropdown now mirrors /customers governance" -ForegroundColor Green
} else { Write-Host "  ✗ customer governance marker missing" -ForegroundColor Red; exit 1 }

if ($est -match "isCreatorLevel.*=.*\['staff', 'sales', 'employee'\]") {
    Write-Host "  ✓ creator-level role detection present" -ForegroundColor Green
} else { Write-Host "  ✗ creator-level role detection missing" -ForegroundColor Red; exit 1 }

if ($est -match "custQuery\.eq\('created_by_user_id', ctx\.user_id\)") {
    Write-Host "  ✓ customer dropdown applies created_by_user_id filter for creator-level roles" -ForegroundColor Green
} else { Write-Host "  ✗ created_by_user_id filter missing on customer dropdown" -ForegroundColor Red; exit 1 }

if ($est -match "estimates has no warehouse_id") {
    Write-Host "  ✓ estimates query uses explicit governance (no warehouse_id filter)" -ForegroundColor Green
} else { Write-Host "  ✗ estimates explicit governance comment missing" -ForegroundColor Red; exit 1 }

if ($est -match "branch_id\.eq\.\$\{ctx\.branch_id\},branch_id\.is\.null") {
    Write-Host "  ✓ accountant role gets branch + shared visibility" -ForegroundColor Green
} else { Write-Host "  ✗ accountant shared-branch rule missing" -ForegroundColor Red; exit 1 }

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
git commit -m "fix(estimates): governance leak - customer dropdown showed all customers to staff/sales

Bug:
Inside the 'New Estimate' dialog, the customer dropdown listed
ALL company customers — including ones the current user did not
create. This bypassed the rule already enforced on /customers
('👨‍💼 تعرض العملاء التي أنشأتها فقط' for staff/sales/employee).

Root cause:
The customers query in app/estimates/page.tsx only filtered by
company_id, ignoring the role-based scoping that /customers page
applies. Also, the estimates query was using applyDataVisibilityFilter
which adds .eq('warehouse_id', ...) — but the estimates table has
no warehouse_id column, so the filter would error out for
non-privileged roles.

Fix:
- Customer dropdown: explicit role-based filter mirroring /customers:
  * owner/admin/general_manager → all
  * manager → branch only
  * accountant → branch + null-branch (shared)
  * staff/sales/employee → created_by_user_id = self
- Estimates query: same explicit pattern (avoids the missing
  warehouse_id column issue).

Governance preserved across the whole /estimates page now:
- Customer dropdown ✓
- Estimates list ✓
- Product dropdown ✓ (already done in v3.55.1)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.7 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test as 'staff' / 'sales' role:" -ForegroundColor Cyan
    Write-Host "  /estimates -> عرض جديد -> dropdown العميل يَعرض فقط العملاء الذين أنشأتهم" -ForegroundColor White
}
