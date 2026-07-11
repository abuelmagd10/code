$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.608.ps1") { Remove-Item -LiteralPath "push_v3.74.608.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.609"') {
    Write-Host "+ 3.74.609" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch 'canReturnBase' -or $pg -notmatch 'طلب مرتجع') {
    Write-Host "X request-return button missing" -ForegroundColor Red; exit 1
}
Write-Host "+ request-return button for non-management roles" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "app/invoices/[id]/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.609.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.608.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_609.txt"
    $msgLines = @(
        'feat(returns): v3.74.609 - Request Return button for non-management roles',
        '',
        'v3.74.608 hid the direct return buttons from non-owner/GM roles',
        'but left them with no alternative in place on the invoice page -',
        'the owner immediately asked how the accountant files a request',
        'from there. Now the SAME spot shows, for roles without the',
        'express lane, an orange "Request Return / طلب مرتجع" button',
        'linking to the sales-return-requests module (management approval',
        '+ warehouse receive cycle), under the SAME returnability',
        'conditions (extracted to canReturnBase; direct buttons =',
        'canDirectReturn && canReturnBase).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.609 pushed - every role has a return path in place" -ForegroundColor Green
}
