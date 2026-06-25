$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.350.ps1") { Remove-Item -LiteralPath "push_v3.74.350.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.351"') {
    Write-Host "+ 3.74.351" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- revenue-account warning is gone ----------------------------------------
$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
if ($bf -match 'تأكد من ربط الخدمة بحساب إيرادات') {
    Write-Host "X BookingForm still shows the revenue-account warning" -ForegroundColor Red; exit 1
}
if ($bf -match 'Ensure the service has a revenue account linked') {
    Write-Host "X BookingForm still shows the EN revenue-account warning" -ForegroundColor Red; exit 1
}
if ($bf -match 'AlertTriangle') {
    Write-Host "X BookingForm still imports AlertTriangle" -ForegroundColor Red; exit 1
}
if ($bf -notmatch 'v3.74.351') {
    Write-Host "X BookingForm missing v3.74.351 marker" -ForegroundColor Red; exit 1
}
Write-Host "+ BookingForm: revenue-account warning removed" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_351.txt"
    $msgLines = @(
        'fix(bookings): v3.74.351 - drop revenue-account warning from the booking form',
        '',
        'Owner: the price + quantity section of the new-booking form was',
        'showing a permanent amber warning -',
        '  "Ensure the service has a revenue account linked before',
        '   completing - this affects invoice creation."',
        '- to a booking_officer who has no permission to touch accounting',
        'accounts in the first place. The warning was aimed at the user',
        'who configures the service, not the user creating the booking,',
        'and shipping it on every booking made the form look broken even',
        'when everything was wired up correctly.',
        '',
        'Removed the warning block (and its now-unused AlertTriangle',
        'import). The actual revenue-account check still runs server-side',
        'when the invoice is generated, so accounting safety is unchanged.',
        '',
        'Files',
        '  components/bookings/BookingForm.tsx',
        '  lib/version.ts -> 3.74.351'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.351 pushed" -ForegroundColor Green
}
