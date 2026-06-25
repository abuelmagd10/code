$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.351.ps1") { Remove-Item -LiteralPath "push_v3.74.351.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.352"') {
    Write-Host "+ 3.74.352" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000352_v3_74_352_service_schedules_and_booking_payments_booking_officer_select.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE POLICY service_schedules_booking_officer_select ON public.service_schedules',
        'CREATE POLICY booking_payments_booking_officer_select ON public.booking_payments',
        "cm.role       = 'booking_officer'"
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: booking_officer SELECT on schedules + payments" -ForegroundColor Green
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_352.txt"
    $msgLines = @(
        'fix(rls): v3.74.352 - booking officer sees the right service schedules',
        '',
        'Symptom (owner, June 24 2026):',
        '  1. The work hours saved on a service show up DIFFERENTLY',
        '     (empty or generic fallback) when a booking_officer opens',
        '     the same service.',
        '  2. When the same booking_officer starts a new booking, the',
        '     defined slots do not appear in the time picker.',
        '',
        'Root cause',
        '  service_schedules + booking_payments still relied on the',
        '  same can_access_record_branch(company_id, branch_id) check',
        '  that v3.74.349 / v3.74.350 already worked around for',
        '  services and service_staff. For a floating booking_officer',
        '  that function reduces to NULL = branch_x = NULL = false, so',
        '  the SELECT returns zero rows. The Service detail page and',
        '  BookingForm both interpret zero rows as "no schedule found"',
        '  and fall through to a default grid - the exact "different',
        '  times" the owner reported.',
        '',
        'Fix',
        '  Two new PERMISSIVE SELECT policies mirroring v3.74.349 /',
        '  v3.74.350:',
        '    * service_schedules_booking_officer_select',
        '    * booking_payments_booking_officer_select',
        '  Booking officer with branch X sees branch X rows plus NULL-',
        '  branch legacy rows; booking officer with no branch sees',
        '  every row in the company. Original *_select policies stay',
        '  untouched, so every other role keeps current behaviour.',
        '',
        'Verified',
        '  As the affected booking_officer, the visible schedule count',
        '  jumped from 0 to 6 for the test service.',
        '',
        'Files',
        '  supabase/migrations/20260624000352_v3_74_352_service_schedules_and_booking_payments_booking_officer_select.sql',
        '  lib/version.ts -> 3.74.352'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.352 pushed" -ForegroundColor Green
}
