# v3.55.5 — Branch + Creator visibility governance on /estimates (mirrors /customers + /sales_orders)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "buildDataVisibilityFilter") {
    Write-Host "  ✓ estimates imports buildDataVisibilityFilter" -ForegroundColor Green
} else { Write-Host "  ✗ buildDataVisibilityFilter import missing" -ForegroundColor Red; exit 1 }

if ($est -match "applyDataVisibilityFilter") {
    Write-Host "  ✓ estimates imports + uses applyDataVisibilityFilter" -ForegroundColor Green
} else { Write-Host "  ✗ applyDataVisibilityFilter missing" -ForegroundColor Red; exit 1 }

if ($est -match "setUserContext") {
    Write-Host "  ✓ estimates manages userContext state" -ForegroundColor Green
} else { Write-Host "  ✗ userContext state missing" -ForegroundColor Red; exit 1 }

if ($est -match "created_by_user_id") {
    Write-Host "  ✓ estimates uses created_by_user_id" -ForegroundColor Green
} else { Write-Host "  ✗ created_by_user_id missing" -ForegroundColor Red; exit 1 }

if ($est -match "branch_id:.*userContext.*branch_id") {
    Write-Host "  ✓ estimates auto-fills branch_id from userContext" -ForegroundColor Green
} else { Write-Host "  ✗ branch_id auto-fill missing" -ForegroundColor Red; exit 1 }

if ($est -match "تعرض العروض الخاصة بفرعك فقط") {
    Write-Host "  ✓ branch-level governance notice present" -ForegroundColor Green
} else { Write-Host "  ✗ branch notice missing" -ForegroundColor Red; exit 1 }

if ($est -match "تعرض العروض التي أنشأتها فقط") {
    Write-Host "  ✓ creator-level governance notice present" -ForegroundColor Green
} else { Write-Host "  ✗ creator notice missing" -ForegroundColor Red; exit 1 }

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
git commit -m "feat(estimates): branch+creator visibility governance (mirrors customers + sales_orders)

DB migration (applied via Supabase MCP):
- ALTER TABLE estimates ADD COLUMN branch_id, cost_center_id, created_by_user_id
- 3 indexes for performance

App layer (app/estimates/page.tsx):
- Import buildDataVisibilityFilter + applyDataVisibilityFilter
- New userContext state - fetches role+branch+cost_center+warehouse from company_members
- Load: applies applyDataVisibilityFilter(query, rules, 'estimates') automatically
- saveEstimate: auto-fills branch_id + cost_center_id + created_by_user_id from userContext
- convertToSO: inherits branch + cost_center from source estimate, sets created_by_user_id
- Reload after save uses same filter (no record visible to user who shouldn't see it)

Governance behavior now matches /customers + /sales_orders:
- owner/admin/general_manager: see all company estimates (👑)
- manager/accountant: see estimates from their branch only (🏢)
- staff/sales/employee: see only estimates they created (👨‍💼)

RLS layers still apply (no regression):
- is_company_member: any company member can read
- can_modify_data: only writable roles can INSERT/UPDATE
- can_delete_resource: DELETE follows RBAC
- estimates_owner_dml + estimates_owner_select: company owner safety net" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.5 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /estimates as owner   → sees all + 👑 notice" -ForegroundColor White
    Write-Host "  /estimates as manager → only branch estimates + 🏢 notice" -ForegroundColor White
    Write-Host "  /estimates as staff   → only his own + 👨‍💼 notice" -ForegroundColor White
    Write-Host "  Save new estimate → branch_id + created_by_user_id auto-filled" -ForegroundColor White
}
