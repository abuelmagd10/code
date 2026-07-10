$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.594.ps1") { Remove-Item -LiteralPath "push_v3.74.594.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.595"') {
    Write-Host "+ 3.74.595" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bp = Get-Content -LiteralPath "components/bookings/BookingPayments.tsx" -Raw
if ($bp -notmatch 'v3\.74\.595' -or $bp -notmatch 'false && canEdit') {
    Write-Host "X BookingPayments form not disabled" -ForegroundColor Red; exit 1
}
$rt = Get-Content -LiteralPath "app/api/bookings/[id]/payment/route.ts" -Raw
if ($rt -notmatch '410') {
    Write-Host "X payment route not blocked" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260710000595_v3_74_595_disable_booking_direct_payments.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ booking direct payments disabled (UI + route + RPC mirror)" -ForegroundColor Green

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
    "components/bookings/BookingPayments.tsx" `
    "app/api/bookings/[id]/payment/route.ts" `
    "supabase/migrations/20260710000595_v3_74_595_disable_booking_direct_payments.sql" `
    "lib/version.ts" `
    "push_v3.74.595.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.594.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_595.txt"
    $msgLines = @(
        'fix(bookings): v3.74.595 - disable direct payment recording on booking page',
        '',
        'Owner governance decision: the booking cycle is execute ->',
        'linked sales invoice -> the BRANCH ACCOUNTANT completes all',
        'collection from the invoice through the payments module (with',
        'its approval/FX/SoD gates). The booking-page "record payment"',
        'form let any bookings-write role (booking officer, staff) take',
        'real money (payment + JE + treasury) outside that cycle.',
        '',
        'Triple gate:',
        '- DB: add_booking_payment_atomic raises a clear business error',
        '  (migration 20260710000595, already live via MCP)',
        '- API: POST /api/bookings/[id]/payment returns 410 with the same',
        '  Arabic guidance',
        '- UI: the form is gone; an info note explains where collection',
        '  happens. Payment history stays visible read-only; invoice',
        '  payments keep syncing back to the booking display.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.595 pushed - booking payments routed through invoices only" -ForegroundColor Green
}
