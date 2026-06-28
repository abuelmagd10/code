$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.383.ps1") { Remove-Item -LiteralPath "push_v3.74.383.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.384"') {
    Write-Host "+ 3.74.384" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260628000384_v3_74_384_sync_employee_user_id.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 384" -ForegroundColor Green
} else { Write-Host "X missing migration 384" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'sync_employee_user_id_from_member',
    'sync_employee_user_id_ins',
    'sync_employee_user_id_upd',
    'sync_employee_user_id_del',
    'AFTER UPDATE OF employee_id, user_id',
    'IS DISTINCT FROM'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers function + 3 triggers + one-shot sync" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_384.txt"
    $msgLines = @(
        'fix(employees): v3.74.384 - auto-sync employees.user_id with company_members.employee_id',
        '',
        'Root-cause fix for a data drift the owner uncovered during E2E',
        'testing of the booking flow. The repo has TWO places that record',
        'the user-employee linkage:',
        '  1. company_members.employee_id  (source of truth, written by',
        '     the "ربط مستخدم بموظف" UI on /settings/users)',
        '  2. employees.user_id             (legacy column that several',
        '     DB functions still depend on)',
        '',
        'When the linkage is changed via the UI, only (1) is updated. (2)',
        'silently drifts and starts pointing at the wrong user. Audit',
        'across the codebase shows the legacy column is read by:',
        '  - 3 commission RPCs (commission attribution to invoice creator)',
        '  - the biometric attendance RLS policy (e.user_id = auth.uid())',
        '  - 2 historical data migrations (one-shot, not re-run)',
        '',
        'Symptoms when drifted:',
        '  - Commission calc attributes invoices to the wrong employee',
        '  - Attendance RLS lets employee A read employee B logs',
        '  - Booking-staff dropdown shows the right name but stamps the',
        '    wrong user_id (the trigger we ship next stage will rely on',
        '    this column being correct)',
        '',
        'Fix',
        '  function sync_employee_user_id_from_member()',
        '    keeps employees.user_id in lock-step with the company_members',
        '    row that points at the employee. Skips writes when the value',
        '    is already correct (IS DISTINCT FROM guard).',
        '  3 triggers on company_members',
        '    AFTER INSERT, AFTER UPDATE OF employee_id, user_id,',
        '    AFTER DELETE. Three separate triggers because PostgreSQL',
        '    does not allow combining UPDATE OF columns with OR INSERT/',
        '    DELETE in a single CREATE TRIGGER statement.',
        '  one-shot sync',
        '    Migration runs a single UPDATE that aligns every employees.',
        '    user_id in every company to the linkage stored on company_',
        '    members.employee_id. No-op when already in sync.',
        '',
        'Validation',
        '  Test company (تست) employees were drifted before the fix:',
        '    خالد عجلان  -> 07e580c5 (bolok)  WRONG',
        '    خالد زيتون  -> NULL              WRONG',
        '  After migration:',
        '    خالد عجلان  -> 24550790 (baikeyous1)  RIGHT',
        '    خالد زيتون  -> 07e580c5 (bolok)        RIGHT',
        '    احمد ابو المجد -> 0fadbf26 (owner)     RIGHT',
        '',
        'Future work tracked separately',
        '  Long-term we should refactor the 3 commission RPCs and the',
        '  attendance RLS policy to read employee linkage through',
        '  company_members.employee_id instead of employees.user_id, then',
        '  drop the column. Not required now - the sync trigger gives us',
        '  the correctness guarantee.',
        '',
        'Files',
        '  supabase/migrations/20260628000384_v3_74_384_sync_employee_user_id.sql',
        '  lib/version.ts -> 3.74.384',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP. All companies',
        '  now in consistent state.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.384 pushed - employee user_id auto-sync" -ForegroundColor Green
}
