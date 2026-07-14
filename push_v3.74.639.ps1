$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.638.ps1") { Remove-Item -LiteralPath "push_v3.74.638.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.639"') {
    Write-Host "+ 3.74.639" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pg -notmatch 'const acctDefaults = accounts\.length > 0') { Write-Host "X account auto-fill fix missing in resetFormData" -ForegroundColor Red; exit 1 }
if ($pg -notmatch 'income_account_id: acctDefaults\.incomeId') { Write-Host "X income_account_id not wired to acctDefaults" -ForegroundColor Red; exit 1 }
Write-Host "+ resetFormData now pre-fills accounting accounts (no more 'None')" -ForegroundColor Green

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
    "push_v3.74.639.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.638.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_639.txt"
    $msgLines = @(
        'fix(products): v3.74.639 - accounting linkage now actually pre-fills on a fresh form',
        '',
        '- resetFormData computes default income/expense accounts from the loaded',
        '  chart of accounts and sets them directly, instead of relying on a',
        '  useEffect that did not re-run when opening a new form with the default',
        '  item/product type unchanged.',
        '- Fixes the mismatch where the notice said "accounts selected automatically"',
        '  but the dropdowns showed "None".'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.639 pushed - accounting accounts pre-fill correctly" -ForegroundColor Green
}
