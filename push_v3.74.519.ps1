$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.518.ps1") { Remove-Item -LiteralPath "push_v3.74.518.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.519"') {
    Write-Host "+ 3.74.519" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$rep = Get-Content -LiteralPath "app/reports/purchase-orders-status/page.tsx" -Raw
$so = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
if ($rep -match "currencySymbols\['EGP'\]" -or $so -match "currencySymbols\['EGP'\]") {
    Write-Host "X hardcoded EGP symbol still present" -ForegroundColor Red; exit 1
}
if ($rep -notmatch 'baseSymbol' -or $so -notmatch 'statsBaseSymbol') {
    Write-Host "X base-currency symbol derivation missing" -ForegroundColor Red; exit 1
}
Write-Host "+ no hardcoded currency symbols - derived from company base" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_519.txt"
    $msgLines = @(
        'fix(fx): v3.74.519 - no hardcoded EGP symbols (pre-launch polish)',
        '',
        'Owner: fix before showing the product to real customers - a',
        'company with a non-EGP base currency would see the pound sign on',
        'these widgets.',
        '',
        '- reports/purchase-orders-status: the three summary cards',
        '  (unbilled / partial / billed) now derive the symbol from the',
        '  company base currency (app_currency + change listener).',
        '- sales-orders stats card: same fix.',
        '',
        'Files',
        '  app/reports/purchase-orders-status/page.tsx',
        '  app/sales-orders/page.tsx',
        '  lib/version.ts -> 3.74.519'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.519 pushed - currency symbols fully dynamic" -ForegroundColor Green
}
