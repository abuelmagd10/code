$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.623.ps1") { Remove-Item -LiteralPath "push_v3.74.623.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.624"') {
    Write-Host "+ 3.74.624" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/backup/[id]/download/route.ts" -Raw
if ($route -notmatch 'download: downloadName') { Write-Host "X backup download attachment fix missing" -ForegroundColor Red; exit 1 }
$tbl = Get-Content -LiteralPath "components/backup/BackupHistoryTable.tsx" -Raw
if ($tbl -match 'a.target = "_blank"') { Write-Host "X backup download still opens new tab" -ForegroundColor Red; exit 1 }
Write-Host "+ backup download now forces attachment (no new tab)" -ForegroundColor Green

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
    "app/api/backup/[id]/download/route.ts" `
    "components/backup/BackupHistoryTable.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.624.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.623.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_624.txt"
    $msgLines = @(
        'fix(backup): v3.74.624 - download saves file instead of opening JSON in a new tab',
        '',
        '- api/backup/[id]/download: pass { download: <filename> } to createSignedUrl',
        '  so Supabase Storage returns Content-Disposition: attachment (works',
        '  cross-origin, unlike the anchor download attribute).',
        '- BackupHistoryTable: removed target="_blank" so the browser saves the',
        '  file in-place instead of rendering the JSON inline in a new tab; use',
        '  the server-provided filename as the download hint.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.624 pushed - backup download fixed" -ForegroundColor Green
}
