$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.626.ps1") { Remove-Item -LiteralPath "push_v3.74.626.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.627"') {
    Write-Host "+ 3.74.627" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Self-checks: Resend-first weekly email + email-now route + button
$emails = Get-Content -LiteralPath "lib/backup/backup-emails.ts" -Raw
if ($emails -notmatch 'api.resend.com/emails') { Write-Host "X weekly email not using Resend" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "app/api/backup/email-now/route.ts")) { Write-Host "X email-now route missing" -ForegroundColor Red; exit 1 }
$set = Get-Content -LiteralPath "app/settings/page.tsx" -Raw
if ($set -notmatch 'handleEmailBackupNow') { Write-Host "X email-now button/handler missing" -ForegroundColor Red; exit 1 }
Write-Host "+ Resend-first weekly email + email-now button present" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "lib/backup/backup-emails.ts" `
    "app/api/backup/email-now/route.ts" `
    "app/settings/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.627.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.626.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_627.txt"
    $msgLines = @(
        'feat(backup): v3.74.627 - weekly email via Resend + on-demand "email me now"',
        '',
        '- sendWeeklyBackupEmail now sends via Resend (the provider the app already',
        '  uses) with SMTP as fallback, so weekly backups work with the existing',
        '  production email setup (attachments as base64).',
        '- New /api/backup/email-now: owner emails their own backup (Excel + JSON)',
        '  on demand — lets them test delivery without waiting for the weekly cron.',
        '- settings: "Email backup to me now" button.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.627 pushed - weekly email via Resend + email-now" -ForegroundColor Green
}
