$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.681.ps1") { Remove-Item -LiteralPath "push_v3.74.681.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.682"') {
    Write-Host "+ 3.74.682" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.682]")) { Write-Host "X CHANGELOG missing [3.74.682]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260716000682_v3_74_682_auto_approve_booking_withdrawal_no_manager.sql")) { Write-Host "X 682 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
$act = [regex]::Match($fn, "CREATE OR REPLACE FUNCTION public\.request_booking_stock_withdrawal[\s\S]*?(?=\r?\nCREATE OR REPLACE FUNCTION|\z)")
if (-not $act.Success -or $act.Value -notmatch "v_has_mgr") {
    Write-Host "X request_booking_stock_withdrawal missing the no-manager auto-approve in snapshot" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot captured the auto-approve-no-manager change" -ForegroundColor Green

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
    "supabase/migrations/20260716000682_v3_74_682_auto_approve_booking_withdrawal_no_manager.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.682.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.681.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_682.txt"
    $msgLines = @(
        'fix(bookings): v3.74.682 - auto-approve booking withdrawal when branch has no store manager',
        '',
        '- request_booking_stock_withdrawal auto-approves the withdrawal (status',
        '  approved + note) and skips the store-manager notification when the',
        '  booking branch has no store/warehouse manager. Mirrors v3.74.664; stops',
        '  the booking from being permanently blocked with no one to approve.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.682 pushed - auto-approve booking withdrawal when no store manager" -ForegroundColor Green
}
