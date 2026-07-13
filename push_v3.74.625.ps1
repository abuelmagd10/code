$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.624.ps1") { Remove-Item -LiteralPath "push_v3.74.624.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.625"') {
    Write-Host "+ 3.74.625" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Self-checks: new files + button present
if (-not (Test-Path "lib/backup/excel-export.ts")) { Write-Host "X excel-export.ts missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "app/api/backup/export-excel/route.ts")) { Write-Host "X export-excel route missing" -ForegroundColor Red; exit 1 }
$pkg = Get-Content -LiteralPath "package.json" -Raw
if ($pkg -notmatch '"exceljs"') { Write-Host "X exceljs not in package.json" -ForegroundColor Red; exit 1 }
$set = Get-Content -LiteralPath "app/settings/page.tsx" -Raw
if ($set -notmatch 'handleExportExcel') { Write-Host "X Excel button/handler missing" -ForegroundColor Red; exit 1 }
Write-Host "+ Excel export files + button present" -ForegroundColor Green

# exceljs must be FULLY installed locally so tsc can resolve its types.
# Check the package.json marker (not just the folder) — a half-installed dir
# would make tsc fail. Reinstall whenever the marker is missing.
if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
    if (-not (Test-Path "node_modules/exceljs/package.json")) { Write-Host "X exceljs still not installed" -ForegroundColor Red; exit 1 }
} else {
    Write-Host "+ exceljs already installed" -ForegroundColor Green
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

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
# نرفع أيضاً package.json + package-lock.json حتى يثبّت Vercel exceljs عند البناء
git add -- `
    "lib/version.ts" `
    "package.json" `
    "package-lock.json" `
    "lib/backup/excel-export.ts" `
    "app/api/backup/export-excel/route.ts" `
    "app/settings/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.625.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.624.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_625.txt"
    $msgLines = @(
        'feat(backup): v3.74.625 - readable Excel export alongside JSON backup',
        '',
        '- New /api/backup/export-excel builds a formatted .xlsx from the same',
        '  backup dataset: summary dashboard + customers, suppliers, products,',
        '  sales/purchase invoices, payments, journal entries, employees, and',
        '  chart of accounts. IDs resolved to names, money columns + totals, RTL.',
        '- lib/backup/excel-export.ts via exceljs (added to dependencies).',
        '- settings: "Export as Excel" button next to the JSON backup (JSON kept',
        '  as the restore format).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.625 pushed - Excel export live" -ForegroundColor Green
}
