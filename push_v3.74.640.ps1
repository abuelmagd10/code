$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.639.ps1") { Remove-Item -LiteralPath "push_v3.74.639.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.640"') {
    Write-Host "+ 3.74.640" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pg -notmatch 'const resolveDefaultAccountsFor = \(') { Write-Host "X resolveDefaultAccountsFor helper missing" -ForegroundColor Red; exit 1 }
if ($pg -notmatch "resolveDefaultAccountsFor\('service', 'service'\)") { Write-Host "X service toggle not wired to helper" -ForegroundColor Red; exit 1 }
$hits = ([regex]::Matches($pg, 'resolveDefaultAccountsFor\(')).Count
if ($hits -lt 6) { Write-Host "X expected >=6 resolveDefaultAccountsFor calls, found $hits" -ForegroundColor Red; exit 1 }
Write-Host "+ synchronous account resolution wired into every type switch ($hits call sites)" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "app/products/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.640.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.639.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_640.txt"
    $msgLines = @(
        'fix(products): v3.74.640 - service items get service revenue, not sales revenue',
        '',
        '- The accounting accounts were resolved by a useEffect that did not re-run',
        '  reliably on type switch, so a service could keep the product-mode',
        '  income account (Sales Revenue) instead of Service Revenue.',
        '- Added resolveDefaultAccountsFor(itemType, productType) and call it',
        '  synchronously inside resetFormData and every item/product type toggle',
        '  (product, service, manufactured, raw_material, purchased) when creating',
        '  a new item. Editing preserves stored accounts.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.640 pushed - correct accounts per item type" -ForegroundColor Green
}
