$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.699.ps1") { Remove-Item -LiteralPath "push_v3.74.699.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.700"') {
    Write-Host "+ 3.74.700" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.700]")) { Write-Host "X CHANGELOG missing [3.74.700]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260718000700_v3_74_700_selected_optional_item_needs_withdrawal_approval.sql")) { Write-Host "X 700 migration record missing" -ForegroundColor Red; exit 1 }

# UI must show the withdrawal block for anything that deducts stock
$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -notmatch "bi\.requires_withdrawal_approval \|\| bi\.auto_deduct_inventory") {
    Write-Host "X BookingAddons still gates the withdrawal UI on the product flag only" -ForegroundColor Red; exit 1
}
Write-Host "+ UI shows the withdrawal request for any stock-deducting item" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "v3\.74\.700") { Write-Host "X functions.sql missing the 700 gate rule" -ForegroundColor Red; exit 1 }
# sold products must stay outside this gate
if ($fn -notmatch "gla\.kind <> 'extra'") { Write-Host "X the extra/sold-product exclusion was lost" -ForegroundColor Red; exit 1 }
Write-Host "+ snapshot: gate covers stock-deducting service items, extras excluded" -ForegroundColor Green

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
    "supabase/migrations/20260718000700_v3_74_700_selected_optional_item_needs_withdrawal_approval.sql" `
    "supabase/schema/functions.sql" `
    "components/bookings/BookingAddons.tsx" `
    "push_v3.74.700.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.699.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_700.txt"
    $msgLines = @(
        'fix(bookings): v3.74.700 - a selected optional service item needs withdrawal approval',
        '',
        '- Owner rule: "optional" only decides whether the executor includes the',
        '  item; once selected it is governed exactly like a mandatory one.',
        '- The gate previously required an approved withdrawal only when the',
        '  PRODUCT had requires_withdrawal_approval set, so an item with stock',
        '  deduction enabled but that flag off left the warehouse silently.',
        '- Now any service item (kind <> extra) that actually deducts stock',
        '  requires an approved withdrawal, in both the gate and the UI. Sold',
        '  products still leave through the invoice dispatch cycle.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.700 pushed - selected optional items are governed like mandatory" -ForegroundColor Green
}
