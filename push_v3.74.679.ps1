$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.678.ps1") { Remove-Item -LiteralPath "push_v3.74.678.ps1" -Force }
foreach ($f in @("tsc678.log","tsc679.log")) { if (Test-Path $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue } }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.679"') {
    Write-Host "+ 3.74.679" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.679]")) { Write-Host "X CHANGELOG missing [3.74.679]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260716000679_v3_74_679_booking_withdrawal_notification_routing.sql")) { Write-Host "X 679 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "p_booking_id::text" -or $fn -notmatch "booking_withdrawal_request") {
    Write-Host "X functions.sql missing the withdrawal event_key change (dump incomplete)" -ForegroundColor Red; exit 1
}
Write-Host "+ functions.sql captured the withdrawal routing change" -ForegroundColor Green

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
    "lib/notification-routing.ts" `
    "supabase/migrations/20260716000679_v3_74_679_booking_withdrawal_notification_routing.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.679.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.678.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_679.txt"
    $msgLines = @(
        'fix(notifications): v3.74.679 - booking stock-withdrawal notification opens the booking',
        '',
        '- Added booking_stock_withdrawal to notification-routing: parses the',
        '  booking id embedded in event_key and routes to /bookings/{id} (where',
        '  the store manager approves in the add-ons panel). Was "cannot navigate".',
        '- request_/decide_booking_stock_withdrawal now embed the booking id in',
        '  event_key; existing notifications backfilled.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.679 pushed - booking withdrawal notification routes to the booking" -ForegroundColor Green
}
