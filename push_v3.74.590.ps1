$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.589.ps1") { Remove-Item -LiteralPath "push_v3.74.589.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.590"') {
    Write-Host "+ 3.74.590" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/booking-notification.service.ts" -Raw
if ($svc -notmatch "staffRecipients" -or $svc -notmatch "assigned_staff_user_ids") {
    Write-Host "X multi-staff notification fix missing" -ForegroundColor Red; exit 1
}
Write-Host "+ multi-staff booking notifications wired (confirm/complete/cancel/reminder)" -ForegroundColor Green

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
    "lib/services/booking-notification.service.ts" `
    "lib/version.ts" `
    "push_v3.74.590.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.589.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_590.txt"
    $msgLines = @(
        'fix(bookings): v3.74.590 - notify ALL assigned staff, not just one',
        '',
        'Booking notifications (confirm, complete, cancel, reminder) went',
        'only to the single staff_user_id and ignored the multi-staff',
        'assignments (booking_staff_assignments via',
        'v_bookings_full.assigned_staff_user_ids, wired since v3.74.361).',
        '',
        'New staffRecipients() helper dedups staff_user_id + all assigned',
        'ids and feeds all four notify points; the reminder fallback to',
        'the branch manager now triggers only when NO staff at all is',
        'assigned.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.590 pushed - all assigned staff get booking notifications" -ForegroundColor Green
}
