# v3.55.1 — Hotfix: قائمة اختيار صنف فى /estimates
# Fix: sale_price → unit_price + is_active filter + branch governance
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "sale_price") {
    Write-Host "  ✗ estimates STILL references sale_price (should be removed)" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  ✓ estimates no longer references invalid 'sale_price' column" -ForegroundColor Green
}

if ($est -match "select\(.id, name, unit_price, item_type, branch_id.\)") {
    Write-Host "  ✓ estimates uses correct unit_price + item_type + branch_id in SELECT" -ForegroundColor Green
} else {
    Write-Host "  ✗ products SELECT is not the expected fixed shape" -ForegroundColor Red
    exit 1
}

if ($est -match "is_active.*true") {
    Write-Host "  ✓ estimates filters is_active=true" -ForegroundColor Green
} else {
    Write-Host "  ✗ is_active filter missing" -ForegroundColor Red
    exit 1
}

if ($est -match "canOverrideBranch") {
    Write-Host "  ✓ estimates applies branch governance (canOverrideBranch)" -ForegroundColor Green
} else {
    Write-Host "  ✗ branch governance missing" -ForegroundColor Red
    exit 1
}

if ($est -match "OVERRIDE_ALLOWED_ROLES|owner.*admin.*manager") {
    Write-Host "  ✓ estimates uses correct OVERRIDE_ALLOWED_ROLES (owner/admin/manager)" -ForegroundColor Green
} else {
    Write-Host "  ✗ role allowlist for branch override missing" -ForegroundColor Red
    exit 1
}

if ($est -match "prod\?\.unit_price") {
    Write-Host "  ✓ updateItem auto-fills unit_price from product correctly" -ForegroundColor Green
} else {
    Write-Host "  ✗ updateItem still uses wrong field" -ForegroundColor Red
    exit 1
}

if ($est -match "لا توجد منتجات متاحة") {
    Write-Host "  ✓ Empty-state message present in Select" -ForegroundColor Green
} else {
    Write-Host "  ✗ Empty-state fallback missing" -ForegroundColor Red
    exit 1
}

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
git commit -m "fix(estimates): product Select was empty - wrong column name 'sale_price' (column is 'unit_price')

Bug:
When creating a new estimate and clicking 'اختر الصنف' in an item row,
the dropdown appeared empty even when the company had active products.

Root cause:
The Supabase query in app/estimates/page.tsx selected a non-existent
column 'sale_price'. The actual products table column is 'unit_price'.
Supabase returned an error and 'prod' became null - resulting in an
empty Select dropdown.

Fix:
- sale_price -> unit_price (correct column)
- Add is_active=true filter (don't show archived products)
- Add item_type to SELECT so 🔧/📦 icon renders correctly
- Apply branch governance: non-(owner/admin/manager) see only
  branch_id.eq.userBranchId OR branch_id.is.null
  (mirrors /invoices/new behavior - lib/validation.ts OVERRIDE_ALLOWED_ROLES)
- Add error handling + toast on failure
- Add 'لا توجد منتجات متاحة' empty-state message inside SelectContent
- Update Product type: sale_price -> unit_price, add branch_id

Governance preserved:
- OVERRIDE_ALLOWED_ROLES = ['owner', 'admin', 'manager']
- accountant/staff/sales/employee see only their branch + shared products
- No changes to CRUD, filters, or any other logic" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /estimates -> 'عرض جديد' -> Add item row -> 'اختر الصنف' shows products" -ForegroundColor White
    Write-Host "  - Owner/Admin/Manager: see all active products" -ForegroundColor White
    Write-Host "  - Accountant/Staff/Sales/Employee: see only their branch + shared" -ForegroundColor White
    Write-Host "  - Picking product auto-fills the unit_price column" -ForegroundColor White
    Write-Host "  - 🔧 (service) and 📦 (product) icons show correctly" -ForegroundColor White
}
