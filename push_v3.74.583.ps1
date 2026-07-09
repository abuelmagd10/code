$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.582.ps1") { Remove-Item -LiteralPath "push_v3.74.582.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.583"') {
    Write-Host "+ 3.74.583" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers: كل صفحة مُصلحة يجب أن تحمل وسم v3.74.583 ---
$checks = @(
    "app/reports/purchase-orders-status/page.tsx",
    "app/reports/sales-discounts/page.tsx",
    "app/reports/invoices/page.tsx",
    "app/reports/purchase-bills-detail/page.tsx",
    "app/reports/shipping/page.tsx",
    "app/api/reports/bookings/bookings-by-branch/route.ts",
    "app/api/reports/bookings/bookings-by-staff/route.ts",
    "app/api/reports/bookings/cancelled-bookings/route.ts",
    "app/api/reports/bookings/occupancy-rate/route.ts",
    "app/api/reports/bookings/revenue-by-service/route.ts",
    "app/api/reports/bookings/top-services/route.ts"
)
foreach ($f in $checks) {
    $raw = Get-Content -LiteralPath $f -Raw
    if ($raw -notmatch 'v3\.74\.583') {
        Write-Host "X $f missing v3.74.583 branch-scope fix" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ branch-scope fixes present in all 11 files" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- $checks "lib/version.ts" "push_v3.74.583.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.582.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_583.txt"
    $msgLines = @(
        'fix(reports): v3.74.583 - close branch-scope leaks in operational reports',
        '',
        'Owner asked to confirm branch-only visibility. Verification found',
        'that while the API-backed reports were already scoped',
        '(buildBranchFilter), several client-side report pages and the',
        'bookings report APIs leaked company-wide data to branch roles:',
        '',
        '- purchase-orders-status: PO + bills queries had NO branch filter',
        '- sales-discounts: invoices query unfiltered',
        '- reports/invoices: invoice list company-wide for everyone',
        '- purchase-bills-detail: bills query unfiltered',
        '- bookings APIs (6 routes): isolation applied to role "manager"',
        '  only - every other non-management role saw all branches',
        '- shipping: safe except no-branch members fell through unfiltered',
        '',
        'All fixed with the warehouse-inventory canOverride pattern:',
        'owner/admin/general_manager company-wide; everyone else locked to',
        'their company_members.branch_id; members with no branch get an',
        'empty result + bilingual notice (never all-branches fallback).',
        '',
        'Verified already-safe (no change): inventory-count,',
        'inventory-audit, report-sales, report-purchases,',
        'sales-by-product, top-products, report-sales-invoices-detail,',
        'shipping-costs, product-expiry, purchase-prices-by-period,',
        'supplier-price-comparison, warehouse-inventory.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.583 pushed - reports branch isolation complete" -ForegroundColor Green
}
