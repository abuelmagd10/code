$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.332.ps1") { Remove-Item -LiteralPath "push_v3.74.332.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.333"') {
    Write-Host "+ 3.74.333" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# /api/products supports branch filter
$prod = Get-Content -LiteralPath "app/api/products/route.ts" -Raw
foreach ($n in @(
    'v3.74.333 — optional branch filter',
    "url.searchParams.get('branch_id')",
    'branch_id.is.null,branch_id.eq.'
)) {
    if ($prod -notmatch [regex]::Escape($n)) {
        Write-Host "X products route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ products route: branch filter wired" -ForegroundColor Green

# ServiceForm re-fetches by branch
$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.333 — products are filtered by the service',
    'watchedServiceBranchId',
    "تُنسخ من هذا الصنف وقت إنشاء الخدمة"
)) {
    if ($sf -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
# Old misleading copy must be gone
if ($sf -match "تُحدَّث تلقائياً عند أي تعديل على المنتج") {
    Write-Host "X stale 'auto-updates' copy still present" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: branch-scoped products + clarified copy" -ForegroundColor Green

# ServiceStaffManager
$ssm = Get-Content -LiteralPath "components/services/ServiceStaffManager.tsx" -Raw
foreach ($n in @(
    'serviceBranchId',
    'v3.74.333 — DELETE expects employee_user_id',
    'employee_user_id=${encodeURIComponent',
    'branchScopedEmployees'
)) {
    if ($ssm -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceStaffManager missing: $n" -ForegroundColor Red; exit 1
    }
}
# Old buggy delete query must be gone
if ($ssm -match 'staff_id=\$\{staffRecordId') {
    Write-Host "X old staff_id query still present" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceStaffManager: branch filter + DELETE fixed" -ForegroundColor Green

# Service detail page passes serviceBranchId
$svcPage = Get-Content -LiteralPath "app/services/[id]/page.tsx" -Raw
if ($svcPage -notmatch [regex]::Escape('serviceBranchId={service.branch_id ?? null}')) {
    Write-Host "X service detail page not passing serviceBranchId" -ForegroundColor Red; exit 1
}
Write-Host "+ service detail page: passes serviceBranchId" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_333.txt"
    $msgLines = @(
        'feat(services): v3.74.333 - Phase 1 - branch-scoped pickers + staff delete fix',
        '',
        'First phase of the service-management overhaul the owner asked for.',
        'UI-side cross-branch guards on the service form so a service in',
        'branch A cannot accidentally link to a product or staff member',
        'from branch B. Plus a long-standing bug where the staff-remove',
        'button was sending the wrong query parameter.',
        '',
        'API',
        '   GET /api/products now accepts ?branch_id=X and returns',
        '   products where branch_id = X OR branch_id IS NULL (NULL =',
        '   company-level product, shared across branches).',
        '   The select also exposes branch_id, sku, unit_price,',
        '   cost_price, income/expense accounts so the form can preview',
        '   them.',
        '',
        'ServiceForm',
        '   - Watches the branch dropdown. On every change, refetches',
        '     /api/products?branch_id=<service branch>.',
        '   - Clears the product_catalog_id selection automatically if',
        '     the previously-linked product is no longer in the filtered',
        '     list (a manager / owner who switched branches mid-form',
        '     no longer keeps a silent cross-branch link).',
        '   - FormDescription rewritten: "Pricing and accounts are',
        '     copied at create time" instead of the old wording that',
        '     promised automatic updates (no trigger exists for that).',
        '',
        'ServiceStaffManager',
        '   - New required prop serviceBranchId. When set, the employee',
        '     picker only shows employees whose branch_id matches (or',
        '     is NULL for legacy company-level members).',
        '   - Fixed the delete bug: the UI was sending',
        '       ?staff_id=${row.id}',
        '     while the API route reads ?employee_user_id=...',
        '     The button silently 400-ed for every removal. Now sends',
        '     the right key, with encodeURIComponent for safety.',
        '   - Service detail page passes service.branch_id through.',
        '',
        'No DB migration. The branch_id column has been on customers and',
        'company_members for a while; products already had it too.',
        '',
        'Files',
        '  app/api/products/route.ts',
        '  components/services/ServiceForm.tsx',
        '  components/services/ServiceStaffManager.tsx',
        '  app/services/[id]/page.tsx',
        '  lib/version.ts -> 3.74.333'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.333 pushed" -ForegroundColor Green
}
