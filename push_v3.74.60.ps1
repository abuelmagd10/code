# v3.74.60 - useAutoRefresh wave 5: +10 pages (manufacturing + fixed-assets + credits)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.60"') {
    Write-Host "+ APP_VERSION = 3.74.60" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.60" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.60]')) {
    Write-Host "+ CHANGELOG 3.74.60" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.60" -ForegroundColor Red; exit 1 }

$wave5 = @(
    'app/manufacturing/material-issue/page.tsx',
    'app/manufacturing/product-receive/page.tsx',
    'app/manufacturing/work-centers/page.tsx',
    'app/inventory/third-party/page.tsx',
    'app/customer-refund-requests/page.tsx',
    'app/customer-credits/[customerId]/page.tsx',
    'app/vendor-credits/[id]/page.tsx',
    'app/fixed-assets/categories/page.tsx',
    'app/fixed-assets/reports/page.tsx',
    'app/fixed-assets/[id]/page.tsx'
)
foreach ($p in $wave5) {
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
    git commit -m "feat(ux): v3.74.60 - useAutoRefresh wave 5 (+10 pages)

Continuing the rollout. Coverage now stands at 65 of about 200
pages. This wave focuses on manufacturing, fixed assets, and
per-record credit/refund pages.

Pages added:
Manufacturing (3): material-issue, product-receive, work-centers.
Inventory (1): third-party.
Customer/Vendor credits (3): customer-refund-requests,
  customer-credits/[customerId], vendor-credits/[id].
Fixed assets (3): categories, reports, [id].

Skipped (need future attention): several HR pages have binary file
encoding issues that block the Edit/grep tools (hr/employees,
hr/attendance/anomalies/devices/settings). They will need a
different approach.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.60 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.59.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.59.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.59.ps1)" -ForegroundColor DarkGray
    }
}
