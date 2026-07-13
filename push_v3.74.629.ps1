$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.628.ps1") { Remove-Item -LiteralPath "push_v3.74.628.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.629"') {
    Write-Host "+ 3.74.629" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bd = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($bd -notmatch 'invoiceFin') { Write-Host "X booking invoice-truth guard missing" -ForegroundColor Red; exit 1 }
Write-Host "+ booking financial guard (invoice source of truth) present" -ForegroundColor Green

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
    "app/bookings/[id]/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.629.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.628.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_629.txt"
    $msgLines = @(
        'fix(bookings): v3.74.629 - show invoice figures as financial source of truth',
        '',
        '- Booking detail Financial Summary now reads Total/Paid/Outstanding from',
        '  the LINKED INVOICE when one exists. A completed booking total is frozen',
        '  by a DB trigger and can drift from the invoice (e.g. an "included" bundle',
        '  item once counted in the booking but never billed), which showed a',
        '  phantom outstanding. The invoice is the accounting truth, so no phantom',
        '  due can appear again.',
        '- Data: BKG-2026-00001 payment_status reconciled to paid (invoice 500/500).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.629 pushed - booking invoice-truth guard" -ForegroundColor Green
}
