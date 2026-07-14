$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.644.ps1") { Remove-Item -LiteralPath "push_v3.74.644.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.645"') {
    Write-Host "+ 3.74.645" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pg -notmatch "preview_next_product_sku") { Write-Host "X SKU live-preview wiring missing" -ForegroundColor Red; exit 1 }
if ($pg -notmatch "skuTouched") { Write-Host "X skuTouched state missing" -ForegroundColor Red; exit 1 }
Write-Host "+ product form previews & auto-assigns SKU" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260714000645_v3_74_645_auto_product_sku.sql")) {
    Write-Host "X migration record missing" -ForegroundColor Red; exit 1
}

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "auto_generate_product_sku") { Write-Host "X functions.sql missing auto_generate_product_sku (dump incomplete)" -ForegroundColor Red; exit 1 }
if ($fn -notmatch "preview_next_product_sku") { Write-Host "X functions.sql missing preview_next_product_sku" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the SKU generator + preview" -ForegroundColor Green

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
    "supabase/migrations/20260714000645_v3_74_645_auto_product_sku.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.645.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.644.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_645.txt"
    $msgLines = @(
        'feat(products): v3.74.645 - auto sequential SKU per branch & item type',
        '',
        '- Format <BRANCH>-<PREFIX>-NNNN (PRD/RAW/SRV/MFG), e.g. MAIN-PRD-0001.',
        '- BEFORE INSERT trigger auto_generate_product_sku fills the SKU when empty',
        '  (advisory-lock, per company+branch+type); custom SKUs are respected.',
        '- Form previews the next code live (preview_next_product_sku) and sends an',
        '  empty SKU for new untouched items so the trigger assigns it race-safely.',
        '- New partial unique index (company_id, sku) prevents duplicate codes.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.645 pushed - automatic sequential product codes" -ForegroundColor Green
}
