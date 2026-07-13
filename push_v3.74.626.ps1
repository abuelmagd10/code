$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.625.ps1") { Remove-Item -LiteralPath "push_v3.74.625.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.626"') {
    Write-Host "+ 3.74.626" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Self-checks: bilingual Excel + weekly email cron present
$xl = Get-Content -LiteralPath "lib/backup/excel-export.ts" -Raw
if ($xl -notmatch 'ExcelLang' -or $xl -notmatch 'const EN:') { Write-Host "X Excel not bilingual" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "app/api/cron/backup-weekly-email/route.ts")) { Write-Host "X weekly-email cron missing" -ForegroundColor Red; exit 1 }
$emails = Get-Content -LiteralPath "lib/backup/backup-emails.ts" -Raw
if ($emails -notmatch 'sendWeeklyBackupEmail') { Write-Host "X sendWeeklyBackupEmail missing" -ForegroundColor Red; exit 1 }
$vj = Get-Content -LiteralPath "vercel.json" -Raw
if ($vj -notmatch 'backup-weekly-email') { Write-Host "X weekly cron not scheduled in vercel.json" -ForegroundColor Red; exit 1 }
Write-Host "+ bilingual Excel + weekly email cron + schedule present" -ForegroundColor Green

# exceljs must be fully installed for tsc.
if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
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
git add -- `
    "lib/version.ts" `
    "lib/backup/excel-export.ts" `
    "lib/backup/backup-emails.ts" `
    "app/api/backup/export-excel/route.ts" `
    "app/api/cron/backup-weekly-email/route.ts" `
    "app/settings/page.tsx" `
    "vercel.json" `
    "supabase/schema/functions.sql" `
    "push_v3.74.626.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.625.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_626.txt"
    $msgLines = @(
        'feat(backup): v3.74.626 - bilingual Excel + weekly emailed backup',
        '',
        '- excel-export: full ar/en localization (labels, sheets, summary) and',
        '  RTL only for Arabic; export route + settings pass the UI language.',
        '- New /api/cron/backup-weekly-email: for companies with auto backup on,',
        '  emails the owner a weekly Excel (readable) + JSON (restore) using the',
        '  existing SMTP transport. Scheduled Sundays 06:00 UTC in vercel.json.',
        '- sendWeeklyBackupEmail added to lib/backup/backup-emails.ts.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.626 pushed - bilingual Excel + weekly email backup" -ForegroundColor Green
}
