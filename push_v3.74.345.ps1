$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.344.ps1") { Remove-Item -LiteralPath "push_v3.74.344.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.345"') {
    Write-Host "+ 3.74.345" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000345_v3_74_345_fix_service_schedule_upsert_trigger.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE OR REPLACE FUNCTION public.svc_trg_validate_schedule',
        "IF TG_OP = 'UPDATE' THEN",
        'v_exclude_id := OLD.id',
        'WHERE service_id  = NEW.service_id',
        'AND day_of_week = NEW.day_of_week'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: trigger rewritten to handle ON CONFLICT UPSERT" -ForegroundColor Green
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_345.txt"
    $msgLines = @(
        'fix(services): v3.74.345 - service schedules UPSERT no longer false-positives',
        '',
        'Symptom (owner, June 24 2026):',
        '  PUT /api/services/<id>/schedules returned 400 with PostgREST',
        '  code P0001: "Schedule slot overlaps an existing active slot',
        '  for this service on day 0." The owner had not changed the',
        '  times - same 09:00 to 18:00 that was already saved.',
        '',
        'Root cause',
        '  The route does INSERT ... ON CONFLICT (service_id, day_of_week)',
        '  DO UPDATE. PostgreSQL fires the BEFORE INSERT trigger first;',
        '  only after the unique-constraint hit does it route into',
        '  UPDATE. In that BEFORE INSERT pass TG_OP = INSERT, so the',
        '  wrapper trigger was passing p_exclude_id = NULL to the',
        '  overlap check. The check then saw the existing row - the very',
        '  row about to be overwritten - as a conflict and raised',
        '  P0001 against itself.',
        '',
        'Fix',
        '  Rewrote svc_trg_validate_schedule. For UPDATE we still use',
        '  OLD.id. For INSERT we now look up the row that owns the same',
        '  (service_id, day_of_week) key (guaranteed at most one by the',
        '  existing uq_service_schedules_service_day unique constraint)',
        '  and pass its id as the exclude key. First-time inserts with',
        '  nothing matching find NULL, so the original protection still',
        '  catches genuine overlaps between distinct rows.',
        '',
        'Verified',
        '  Re-running the failing UPSERT now succeeds in the database.',
        '  Real overlaps (different rows, overlapping times, same day)',
        '  still raise P0001.',
        '',
        'Files',
        '  supabase/migrations/20260624000345_v3_74_345_fix_service_schedule_upsert_trigger.sql',
        '  lib/version.ts -> 3.74.345'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.345 pushed" -ForegroundColor Green
}
