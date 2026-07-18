$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.697.ps1") { Remove-Item -LiteralPath "push_v3.74.697.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.698"') {
    Write-Host "+ 3.74.698" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.698]")) { Write-Host "X CHANGELOG missing [3.74.698]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260718000698_v3_74_698_post_bill_inventory_on_receipt_only.sql")) { Write-Host "X 698 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "v3\.74\.698") { Write-Host "X functions.sql missing the 698 change" -ForegroundColor Red; exit 1 }
# the legacy bill posting must be gone, while sales/payment posting stays
if ($fn -match "'Purchase - ' \|\| NEW\.bill_number") {
    Write-Host "X the legacy purchase-bill posting is still present - aborting" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "'Sales - ' \|\| NEW\.invoice_number") {
    Write-Host "X sales-invoice posting was lost - aborting" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot: bill posting removed, sales/payment posting intact" -ForegroundColor Green

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
    "CHANGELOG.md" `
    "supabase/migrations/20260718000698_v3_74_698_post_bill_inventory_on_receipt_only.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.698.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.697.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_698.txt"
    $msgLines = @(
        'fix(accounting): v3.74.698 - post purchase-bill inventory at goods receipt, not at approval',
        '',
        '- The legacy accrual_accounting_engine trigger posted Dr Inventory /',
        '  Cr AP as soon as a bill became "sent" (accountant approval), before',
        '  the warehouse received anything. That booked stock that did not exist',
        '  and blocked confirm-receipt with 409 inconsistent-posting-state.',
        '- Purchase bills no longer post there. The goods-receipt confirmation',
        '  (post_bill_receipt_atomic) is now the single owner: it posts the full',
        '  journal together with the stock movements.',
        '- Sales-invoice and payment posting are untouched. Migration soft-deletes',
        '  journals this path posted prematurely for not-yet-received bills.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.698 pushed - bill inventory posts at receipt" -ForegroundColor Green
}
