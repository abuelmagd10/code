$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.323.ps1") { Remove-Item -LiteralPath "push_v3.74.323.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.324"') {
    Write-Host "+ 3.74.324" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260624000324_v3_74_324_bookings_responsible_user_and_flexible_rls.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'current_responsible_user_id UUID',
    'bookings_select_v5',
    'bookings_update_v2',
    "OR staff_user_id   = auth.uid()",
    "staff_user_id IS NULL"
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: column + flexible RLS wired" -ForegroundColor Green

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

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_324.txt"
    $msgLines = @(
        'feat(bookings): v3.74.324 - flexible RLS + current responsible user',
        '',
        'First of three migrations (324 -> 325 -> 326) that turn the',
        'existing bookings table into the source of "أوامر الحجز"',
        'WITHOUT moving any data into sales_orders. The booking',
        'lifecycle, availability check, schedules and staff tables stay',
        'exactly as they are.',
        '',
        'This migration changes only:',
        '',
        '1) Row-level access — bookings_select_v5 + bookings_update_v2',
        '   staff / booking_officer can now see and edit a booking they',
        '   did not personally create, IF either:',
        '     (a) they are explicitly assigned via staff_user_id, OR',
        '     (b) it has no assigned staff and lives in their own',
        '         branch (the "open queue" pattern the owner asked for).',
        '   Branch-scope and company-scope roles are unchanged.',
        '',
        '2) Audit/reporting column — current_responsible_user_id',
        '   Populated at create time from staff_user_id when set, and',
        '   updated to the activator if NULL when v3.74.326 wires the',
        '   activate route. Backfilled today from staff_user_id.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000324_v3_74_324_bookings_responsible_user_and_flexible_rls.sql (NEW)',
        '  lib/version.ts -> 3.74.324'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.324 pushed" -ForegroundColor Green
}
