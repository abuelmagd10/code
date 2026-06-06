# v3.74.59 - useAutoRefresh wave 4: +21 pages (reports + bookings + banking)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.59"') {
    Write-Host "+ APP_VERSION = 3.74.59" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.59" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.59]')) {
    Write-Host "+ CHANGELOG 3.74.59" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.59" -ForegroundColor Red; exit 1 }

$wave4 = @(
    'app/reports/branch-comparison/page.tsx',
    'app/reports/branch-cost-center/page.tsx',
    'app/reports/daily-payments-receipts/page.tsx',
    'app/reports/fx-gains-losses/page.tsx',
    'app/reports/top-products/page.tsx',
    'app/reports/sales-by-product/page.tsx',
    'app/reports/sales-invoices-detail/page.tsx',
    'app/reports/bank-transactions/page.tsx',
    'app/reports/bank-accounts-by-branch/page.tsx',
    'app/reports/simple-summary/page.tsx',
    'app/reports/ar-by-currency/page.tsx',
    'app/reports/product-expiry/page.tsx',
    'app/reports/inventory-count/page.tsx',
    'app/reports/login-activity/page.tsx',
    'app/reports/bookings/bookings-by-branch/page.tsx',
    'app/reports/bookings/bookings-by-staff/page.tsx',
    'app/reports/bookings/cancelled-bookings/page.tsx',
    'app/reports/bookings/occupancy-rate/page.tsx',
    'app/reports/bookings/revenue-by-service/page.tsx',
    'app/reports/bookings/top-services/page.tsx',
    'app/banking/[id]/page.tsx'
)
$missing = 0
foreach ($p in $wave4) {
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -match 'useAutoRefresh' -and $c -match 'use-auto-refresh') {
        Write-Host "  + $p" -ForegroundColor Green
    } else { Write-Host "  X $p missing hook" -ForegroundColor Red; $missing++ }
}
if ($missing -gt 0) { exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(ux): v3.74.59 - useAutoRefresh wave 4 (+21 pages)

Biggest single-wave so far. Coverage now stands at 55 of about 200
pages - past the point of diminishing returns for daily-use workflow
pages.

Pages added:
Financial reports (8): branch-comparison, branch-cost-center,
  daily-payments-receipts, fx-gains-losses, top-products,
  sales-by-product, sales-invoices-detail, bank-transactions.
Other reports (6): bank-accounts-by-branch, simple-summary,
  ar-by-currency, product-expiry, inventory-count, login-activity.
Bookings reports (6): bookings-by-branch, bookings-by-staff,
  cancelled-bookings, occupancy-rate, revenue-by-service, top-services.
Banking (1): banking/[id].

Continued the Edit-tool approach from v3.74.58 (per-page, preserves
CRLF + UTF-8). 42 Edit operations total (21 imports + 21 hook calls).

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.59 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.58.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.58.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.58.ps1)" -ForegroundColor DarkGray
    }
}
