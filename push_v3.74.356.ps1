$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.355.ps1") { Remove-Item -LiteralPath "push_v3.74.355.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.356"') {
    Write-Host "+ 3.74.356" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000356_v3_74_356_service_schedules_check_allow_midnight_end.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'DROP CONSTRAINT IF EXISTS chk_service_schedules_times',
        "CHECK (end_time = '00:00:00'::time OR end_time > start_time)"
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: CHECK constraint allows midnight end" -ForegroundColor Green
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_356.txt"
    $msgLines = @(
        'fix(services): v3.74.356 - DB CHECK constraint accepts midnight end-time',
        '',
        'Symptom (owner, June 24 2026):',
        '  After v3.74.354 (UI) + v3.74.355 (Zod schema), saving an',
        '  evening shift like 18:00 -> 00:00 still failed at the',
        '  database level with PostgREST 23514 (check_violation).',
        '',
        'Root cause',
        '  public.service_schedules carried a CHECK constraint',
        '    chk_service_schedules_times CHECK (end_time > start_time)',
        '  As time values, 00:00:00 < 18:00:00 lexicographically, so',
        '  any evening shift ending at midnight was rejected.',
        '',
        'Fix',
        '  Replaced the constraint with',
        '    CHECK (end_time = ''00:00:00''::time OR end_time > start_time)',
        '  All three layers (editor, Zod, DB) now share the same rule:',
        '  end_time "00:00" is the canonical encoding for midnight at',
        '  end-of-day (24:00). Every other end <= start case still',
        '  violates the check exactly as before.',
        '',
        'Verified',
        '  Re-ran the failing UPSERT in the DB - now succeeds and the',
        '  row stores 18:00 -> 00:00 as the user intended.',
        '',
        'Files',
        '  supabase/migrations/20260624000356_v3_74_356_service_schedules_check_allow_midnight_end.sql',
        '  lib/version.ts -> 3.74.356'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.356 pushed" -ForegroundColor Green
}
