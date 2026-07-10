$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.601.ps1") { Remove-Item -LiteralPath "push_v3.74.601.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.602"') {
    Write-Host "+ 3.74.602" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260710000602_v3_74_602_resync_notifications.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ resync notifications fix + invoice deep-link mirrored" -ForegroundColor Green

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
    "supabase/migrations/20260710000602_v3_74_602_resync_notifications.sql" `
    "lib/version.ts" `
    "push_v3.74.602.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.601.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_602.txt"
    $msgLines = @(
        'fix(bookings): v3.74.602 - resync notifications category, isolation, invoice deep-link',
        '',
        '(602) Post-execution addon edit failed with 23514: resync',
        'notifications used category=bookings, not in',
        'notifications_category_check. Fixed to sales; each notification',
        'now isolated in its own exception block so a notification',
        'failure can never roll back the financial sync. Verified the',
        'booking/invoice state was intact (full rollbacks): 510 = 510 =',
        'lines sum, draft, warehouse pending, product stock untouched.',
        '',
        '(602b) Owner: the accountant notification must open the INVOICE.',
        'reference switched to (invoice, invoice_id) - routing already',
        'maps /invoices/{id}. FYI notifications keep the booking',
        'reference. New notif_done_invoice_posted trigger completes the',
        'accountant action-notification automatically when the invoice',
        'leaves draft. The already-delivered notification was repointed.',
        '',
        'Owner confirmed end-to-end: edit synced, accountant received the',
        'high-priority action-required notification.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.602 pushed - accountant lands on the invoice" -ForegroundColor Green
}
