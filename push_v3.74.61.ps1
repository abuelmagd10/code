# v3.74.61 - useAutoRefresh wave 6: +15 pages (new/edit + accounting)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.61"') {
    Write-Host "+ APP_VERSION = 3.74.61" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.61" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.61]')) {
    Write-Host "+ CHANGELOG 3.74.61" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.61" -ForegroundColor Red; exit 1 }

$wave6 = @(
    'app/invoices/new/page.tsx',
    'app/invoices/[id]/edit/page.tsx',
    'app/bills/[id]/edit/page.tsx',
    'app/sales-orders/new/page.tsx',
    'app/purchase-orders/new/page.tsx',
    'app/purchase-orders/[id]/edit/page.tsx',
    'app/journal-entries/new/page.tsx',
    'app/expenses/new/page.tsx',
    'app/expenses/[id]/edit/page.tsx',
    'app/inventory-transfers/new/page.tsx',
    'app/inventory-transfers/[id]/edit/page.tsx',
    'app/accounting/period-closing/page.tsx',
    'app/purchase-returns/[id]/page.tsx',
    'app/fixed-assets/new/page.tsx',
    'app/fixed-assets/[id]/edit/page.tsx'
)
foreach ($p in $wave6) {
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -match 'useAutoRefresh' -and $c -match 'use-auto-refresh') {
        Write-Host "  + $p" -ForegroundColor Green
    } else { Write-Host "  X $p missing hook" -ForegroundColor Red; exit 1 }
}

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
    git commit -m "feat(ux): v3.74.61 - useAutoRefresh wave 6 (+15 pages)

Coverage now stands at 80 of about 200 pages. This wave focuses on
new and edit forms - pages where users typically tab away to look up
info (a customer, product, exchange rate) and come back expecting
fresh dropdown data.

Pages added:
Invoices/Bills (3): invoices/new, invoices/[id]/edit, bills/[id]/edit.
Orders (3): sales-orders/new, purchase-orders/new,
  purchase-orders/[id]/edit.
Journal & Expenses (3): journal-entries/new, expenses/new,
  expenses/[id]/edit.
Inventory transfers (2): inventory-transfers/new,
  inventory-transfers/[id]/edit.
Period / returns (2): accounting/period-closing,
  purchase-returns/[id].
Fixed assets (2): fixed-assets/new, fixed-assets/[id]/edit.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.61 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.60.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.60.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.60.ps1)" -ForegroundColor DarkGray
    }
}
