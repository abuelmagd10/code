$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.630.ps1") { Remove-Item -LiteralPath "push_v3.74.630.ps1" -Force }
if (Test-Path "push_v3.74.631.ps1") { Remove-Item -LiteralPath "push_v3.74.631.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.632"') {
    Write-Host "+ 3.74.632" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -notmatch 'get_inventory_available_balance' -or $ba -notmatch 'branchStockMap') { Write-Host "X branch stock indicator missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "supabase/migrations/20260713000632_v3_74_632_autoselect_optional_bundle_on_booking.sql")) { Write-Host "X autoselect migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ branch stock indicator + auto-select migration present" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fx = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fx -notmatch 'auto-select ALL optional attached') { Write-Host "X live create_booking_atomic not updated" -ForegroundColor Red; exit 1 }
Write-Host "+ live create_booking_atomic auto-selects optional items" -ForegroundColor Green

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
    "components/bookings/BookingAddons.tsx" `
    "supabase/migrations/20260713000632_v3_74_632_autoselect_optional_bundle_on_booking.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.632.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.630.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_632.txt"
    $msgLines = @(
        'feat(bookings): v3.74.632 - branch stock indicator + default-select optional items',
        '',
        '- BookingAddons shows branch-warehouse availability for each attached',
        '  bundle item and each sale product (get_inventory_available_balance).',
        '- create_booking_atomic: on creation, ALL optional attached items are',
        '  auto-selected so the executor opens the booking with them checked and',
        '  only unchecks what was not used/sold (owner decision).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.632 pushed - stock indicator + default-selected optional items" -ForegroundColor Green
}
