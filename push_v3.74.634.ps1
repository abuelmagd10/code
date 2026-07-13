$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.633.ps1") { Remove-Item -LiteralPath "push_v3.74.633.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.634"') {
    Write-Host "+ 3.74.634" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260713000634_v3_74_634_booking_withdrawal_completion_gate.sql")) { Write-Host "X gate migration missing" -ForegroundColor Red; exit 1 }
$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -notmatch 'request_booking_stock_withdrawal' -or $ba -notmatch 'decideWithdrawal') { Write-Host "X booking withdrawal UI missing" -ForegroundColor Red; exit 1 }
$cr = Get-Content -LiteralPath "app/api/bookings/[id]/complete/route.ts" -Raw
if ($cr -notmatch 'booking_blocking_withdrawals_exist') { Write-Host "X completion gate missing in route" -ForegroundColor Red; exit 1 }
Write-Host "+ withdrawal UI + completion gate present" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fx = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fx -notmatch 'booking_blocking_withdrawals_exist') { Write-Host "X live gate function missing from dump" -ForegroundColor Red; exit 1 }
Write-Host "+ live gate function present" -ForegroundColor Green

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
    "app/api/bookings/[id]/complete/route.ts" `
    "supabase/migrations/20260713000634_v3_74_634_booking_withdrawal_completion_gate.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.634.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.633.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_634.txt"
    $msgLines = @(
        'feat(bookings): v3.74.634 - withdrawal request/approve UI + completion gate (stage 2)',
        '',
        '- BookingAddons: for a selected attached item whose product requires',
        '  withdrawal approval, the executor sees "Request withdrawal"; status',
        '  shows pending/approved/rejected; store manager/management get',
        '  Approve/Reject inline.',
        '- complete route: blocks completion (409) while any flagged selected item',
        '  lacks an approved withdrawal (booking_blocking_withdrawals_exist).',
        '- Demo: VitaSlims flagged requires_withdrawal_approval=true.',
        '- Pending: product-form toggle (self-serve config) ships next.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.634 pushed - withdrawal UI + completion gate" -ForegroundColor Green
}
