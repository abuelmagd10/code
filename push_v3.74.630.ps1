$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.629.ps1") { Remove-Item -LiteralPath "push_v3.74.629.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.630"') {
    Write-Host "+ 3.74.630" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260713000630_v3_74_630_booking_addons_executor_only.sql")) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -match 'booking_officer.*bookingBranchId') { Write-Host "X BookingAddons still allows booking_officer" -ForegroundColor Red; exit 1 }
$rt = Get-Content -LiteralPath "app/api/bookings/[id]/route.ts" -Raw
if ($rt -notmatch 'مسؤول الحجز لا يضع خصم') { Write-Host "X discount guard missing" -ForegroundColor Red; exit 1 }
Write-Host "+ addons/discount restricted to executor (3 layers)" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
# Verify the live function no longer allows booking_officer add-ons
$fx = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fx -match "Booking officer: branch scope, and ONLY until execution") { Write-Host "X live function still has old booking_officer rule" -ForegroundColor Red; exit 1 }
Write-Host "+ live assert_booking_addons_permission updated" -ForegroundColor Green

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
    "supabase/migrations/20260713000630_v3_74_630_booking_addons_executor_only.sql" `
    "components/bookings/BookingAddons.tsx" `
    "app/api/bookings/[id]/route.ts" `
    "supabase/schema/functions.sql" `
    "push_v3.74.630.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.629.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_630.txt"
    $msgLines = @(
        'feat(bookings): v3.74.630 - add-ons/sale-products/discount are executor-only',
        '',
        '- assert_booking_addons_permission: removed the booking_officer allowance;',
        '  only management + the assigned executor may select attached bundle items',
        '  or add sale products (booking officer just creates/confirms).',
        '- BookingAddons UI: mirrors the rule (booking officer sees view-only).',
        '- PATCH /api/bookings/[id]: booking officer can no longer set a discount;',
        '  discount is the executor''s job (still subject to owner/GM approval).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.630 pushed - executor-only add-ons/discount" -ForegroundColor Green
}
