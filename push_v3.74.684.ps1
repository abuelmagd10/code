$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.683.ps1") { Remove-Item -LiteralPath "push_v3.74.683.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.684"') {
    Write-Host "+ 3.74.684" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.684]")) { Write-Host "X CHANGELOG missing [3.74.684]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260717000684_v3_74_684_block_withdrawal_approval_insufficient_stock.sql")) { Write-Host "X 684 migration record missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "app/api/booking-stock-withdrawals/[id]/decide/route.ts")) { Write-Host "X decide route missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "WITHDRAWAL_INSUFFICIENT_STOCK") {
    Write-Host "X functions.sql missing the insufficient-stock guard (dump incomplete)" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot captured the insufficient-stock guard" -ForegroundColor Green

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
    "supabase/migrations/20260717000684_v3_74_684_block_withdrawal_approval_insufficient_stock.sql" `
    "supabase/schema/functions.sql" `
    "app/approvals/page.tsx" `
    "push_v3.74.684.ps1" 2>&1 | Out-Null
git add -- "app/api/booking-stock-withdrawals/[id]/decide/route.ts" 2>&1 | Out-Null
git add -u -- "push_v3.74.683.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_684.txt"
    $msgLines = @(
        'fix(bookings): v3.74.684 - block approving a stock withdrawal with insufficient stock',
        '',
        '- decide_booking_stock_withdrawal now checks available stock in the branch',
        '  warehouse on APPROVE (for inventory-tracked products) and raises',
        '  WITHDRAWAL_INSUFFICIENT_STOCK when it is below the requested quantity.',
        '  Rejection is unaffected; untracked products are not gated.',
        '- Approvals inbox shows the available stock on each withdrawal card and',
        '  disables the approve button when short; the API strips the code prefix.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.684 pushed - block withdrawal approval on insufficient stock" -ForegroundColor Green
}
