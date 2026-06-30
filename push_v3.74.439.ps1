$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.438.ps1") { Remove-Item -LiteralPath "push_v3.74.438.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.439"') {
    Write-Host "+ 3.74.439" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000439_v3_74_439_approval_history_table.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 439 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AM\. ?جدول approval_history') {
    Write-Host "X CONTRACTS.md missing Section AM" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AM" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_439.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.439 - approval_history table + RPCs',
        '',
        'lib/manufacturing/approval-history.ts has been calling',
        '   record_approval_action (RPC)',
        '   get_approval_history (RPC)',
        '   approval_history table (direct query in getNextCycleNo)',
        'since the manufacturing approval routes were wired. None of',
        'them existed in the DB. The helper has silent try/catch, so',
        'every approve / reject / submit through a manufacturing route',
        'lost its audit breadcrumb without surfacing any error.',
        '',
        'Schema',
        '   approval_history(id, company_id, reference_type, reference_id,',
        '                    cycle_no, action, actor_id, actor_role,',
        '                    reason, snapshot_data jsonb, branch_id,',
        '                    created_at)',
        '   CHECK constraints pin reference_type to 5 values and action',
        '   to the 9 lifecycle values the helper documents.',
        '   3 indexes (lookup, getNextCycleNo desc, audit feed).',
        '   RLS: members can SELECT and INSERT; no UPDATE/DELETE.',
        '',
        'RPCs',
        '   record_approval_action(...)  RETURNS uuid',
        '   get_approval_history(...)    RETURNS TABLE',
        '',
        'Round-trip smoke test passed in DB.',
        '',
        'Baseline (Section AM) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000439_v3_74_439_approval_history_table.sql',
        '   CONTRACTS.md (Section AM added)',
        '   lib/version.ts -> 3.74.439'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.439 pushed - approval history live" -ForegroundColor Green
}
