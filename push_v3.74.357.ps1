$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.356.ps1") { Remove-Item -LiteralPath "push_v3.74.356.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.357"') {
    Write-Host "+ 3.74.357" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260625000357_v3_74_357_bkg_validate_working_hours_midnight_end.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE OR REPLACE FUNCTION public.bkg_validate_working_hours',
        "WHEN end_time = '00:00:00'::time THEN 24 * 60",
        "WHEN p_end_time = '00:00:00'::time THEN 24 * 60"
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: working-hours check accepts midnight end" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_357.txt"
    $msgLines = @(
        'fix(bookings): v3.74.357 - working-hours check honours "00:00 = end of day"',
        '',
        'Symptom (owner, June 25 2026):',
        '  A booking_officer tried to save a booking at 19:00 on a day',
        '  whose service schedule was 18:00 -> 00:00 (the "evening shift,',
        '  until midnight" convention v3.74.354..356 established). The',
        '  atomic booking RPC came back 400 with P0001:',
        '    "Booking time 19:00:00 - 19:15:00 on day 4 is outside',
        '     service working hours."',
        '',
        'Root cause',
        '  bkg_validate_working_hours compared end_time >= p_end_time',
        '  directly. With schedule.end_time = ''00:00:00'' (canonical',
        '  encoding for midnight at the close of the day), the check',
        '  became 00:00 >= 19:15 - false lexicographically - so every',
        '  booking on a midnight-end schedule was rejected.',
        '',
        'Fix',
        '  Rewrote the function to compare "minutes since midnight" and',
        '  to treat end_time = ''00:00:00'' as 24 * 60 on BOTH the',
        '  schedule side and the booking side. Schedule lookup now',
        '  reads:',
        '    minutes(start) <= minutes(p_start_time)',
        '    AND minutes(end_or_midnight) >= minutes(p_end_time_or_midnight)',
        '  Behaviour for non-midnight schedules is identical to before.',
        '',
        'Verified',
        '  Re-ran the failing RPC on the same row in the DB - the same',
        '  19:00 booking now succeeds.',
        '',
        'Files',
        '  supabase/migrations/20260625000357_v3_74_357_bkg_validate_working_hours_midnight_end.sql',
        '  lib/version.ts -> 3.74.357'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.357 pushed" -ForegroundColor Green
}
