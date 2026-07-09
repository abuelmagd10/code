$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.588.ps1") { Remove-Item -LiteralPath "push_v3.74.588.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.589"') {
    Write-Host "+ 3.74.589" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($pg -notmatch "assigned_staff_names" -or $pg -notmatch 'v3\.74\.589') {
    Write-Host "X booking page assigned-staff display missing" -ForegroundColor Red; exit 1
}
Write-Host "+ assigned staff names on booking details" -ForegroundColor Green

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
    "app/bookings/[id]/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.589.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.588.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_589.txt"
    $msgLines = @(
        'fix(bookings): v3.74.589 - show assigned staff names on booking details',
        '',
        'The details card showed only the single staff EMAIL',
        '(booking.staff_email) and ignored the multi-assignment names',
        '(assigned_staff_names from v_bookings_full, wired since',
        'v3.74.361 and already flowing through GET /api/bookings/[id]',
        'select *).',
        '',
        'Now: when the booking has assigned staff, all their NAMES render',
        'as chips under a stage-aware label (singular/plural); fallback',
        'for legacy rows prefers staff_name over staff_email.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.589 pushed - assigned staff visible on booking" -ForegroundColor Green
}
