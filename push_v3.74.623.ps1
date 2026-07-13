$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.622.ps1") { Remove-Item -LiteralPath "push_v3.74.622.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.623"') {
    Write-Host "+ 3.74.623" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pay = Get-Content -LiteralPath "app/hr/payroll/page.tsx" -Raw
if ($pay -notmatch 'useState<number>\(100\)') { Write-Host "X payslips page size not 100" -ForegroundColor Red; exit 1 }
$seat = Get-Content -LiteralPath "app/settings/seats/page.tsx" -Raw
if ($seat -notmatch 'data.seats.length === 0 \?') { Write-Host "X seats empty-state link not restored" -ForegroundColor Red; exit 1 }
Write-Host "+ payroll print size (100) + seats empty-state link present" -ForegroundColor Green

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
git add -- `
    "lib/version.ts" `
    "app/hr/payroll/page.tsx" `
    "app/settings/seats/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.623.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.622.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_623.txt"
    $msgLines = @(
        'fix(ui): v3.74.623 - payroll print shows all + restore seats empty-state link',
        '',
        '- hr/payroll: payslips list (which is printed as the payroll report)',
        '  now defaults to 100 rows/page so all employees appear and print.',
        '- settings/seats: restored the clickable "صفحة الفوترة" link in the',
        '  empty-state message (DataTable emptyMessage is text-only, so the',
        '  empty state is rendered richly outside the table).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.623 pushed - payroll print + seats link fixed" -ForegroundColor Green
}
