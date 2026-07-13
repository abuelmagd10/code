$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.627.ps1") { Remove-Item -LiteralPath "push_v3.74.627.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.628"') {
    Write-Host "+ 3.74.628" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Self-checks
$dt = Get-Content -LiteralPath "components/DataTable.tsx" -Raw
if ($dt -notmatch "return 'text-start'") { Write-Host "X DataTable alignment fix missing" -ForegroundColor Red; exit 1 }
$bt = Get-Content -LiteralPath "components/bookings/BookingsTable.tsx" -Raw
if ($bt -notmatch 'branch_name' -or $bt -notmatch 'الفرع') { Write-Host "X bookings branch column missing" -ForegroundColor Red; exit 1 }
$cb = Get-Content -LiteralPath "app/reports/bookings/cancelled-bookings/page.tsx" -Raw
if ($cb -notmatch 'branch_name') { Write-Host "X cancelled-bookings branch missing" -ForegroundColor Red; exit 1 }
Write-Host "+ alignment fix + branch columns present" -ForegroundColor Green

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
    "components/DataTable.tsx" `
    "components/bookings/BookingsTable.tsx" `
    "app/api/reports/bookings/cancelled-bookings/route.ts" `
    "app/reports/bookings/cancelled-bookings/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.628.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.627.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_628.txt"
    $msgLines = @(
        'fix(bookings): v3.74.628 - show branch + align table headers with data',
        '',
        '- DataTable: text columns now use logical text-start so header and data',
        '  line up in RTL (Arabic) instead of both floating physical-left; numbers',
        '  keep text-right. LTR unchanged.',
        '- Bookings table: new Branch column (branch_name from v_bookings_full).',
        '- Cancelled-bookings report: added Branch column (API select + table +',
        '  CSV) and aligned headers/data via logical text-start/text-end.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.628 pushed - bookings branch + table alignment" -ForegroundColor Green
}
