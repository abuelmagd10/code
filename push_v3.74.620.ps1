$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.618.ps1") { Remove-Item -LiteralPath "push_v3.74.618.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.620"') {
    Write-Host "+ 3.74.620" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X dump-db-functions failed (check .env.local). Aborting push." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "supabase/schema/functions.sql")) {
    Write-Host "X functions.sql not generated. Aborting." -ForegroundColor Red; exit 1
}

foreach ($f in @(
    "supabase/migrations/20260712000619_v3_74_619_booking_sync_uses_valid_partial_status.sql",
    "supabase/migrations/20260712000620_v3_74_620_normalize_booking_payment_status.sql"
)) {
    if (-not (Test-Path $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

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
    "lib/version.ts" `
    "supabase/schema/functions.sql" `
    "supabase/migrations/20260712000619_v3_74_619_booking_sync_uses_valid_partial_status.sql" `
    "supabase/migrations/20260712000620_v3_74_620_normalize_booking_payment_status.sql" `
    "push_v3.74.620.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.618.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_620.txt"
    $msgLines = @(
        'fix(bookings): v3.74.620 - booking payment_status must be a valid enum value',
        '',
        'Paying a booking-linked invoice failed with 500 because booking sync',
        'wrote payment_status = ''partially_paid'', which the CHECK constraint',
        'chk_bookings_payment_status rejects (allowed: unpaid/partial/paid).',
        '',
        '- v3.74.619 sync_booking_from_invoice_trg(): write ''partial''.',
        '- v3.74.620 normalize_booking_payment_status(): BEFORE trigger that',
        '  coerces any lingering ''partially_paid'' -> ''partial'' (covers',
        '  resync_booking_invoice and complete_booking_atomic too).',
        'Both applied to production via MCP; these migrations mirror them.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.620 pushed - booking payment status fixed" -ForegroundColor Green
}
