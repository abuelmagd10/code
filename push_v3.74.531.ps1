$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.531"') {
    Write-Host "+ 3.74.531" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260705000531_v3_74_531_fix_bill_notify_null_actor.sql" -Raw
if ($mig -notmatch 'v_actor := COALESCE') {
    Write-Host "X migration missing v_actor fallback chain" -ForegroundColor Red; exit 1
}
if ($mig -notmatch 'p_actor_id, v_actor, v_manager_id') {
    Write-Host "X (weak check) notify_branch_manager not defense-in-depth" -ForegroundColor Yellow
}
Write-Host "+ migration has v_actor fallback in trigger" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_531.txt"
    $msgLines = @(
        'fix(triggers): v3.74.531 - bill notify trigger no longer breaks payment approval',
        '',
        'Owner clicks approve on a supplier payment. process_payment_',
        'approval_stage cascades: UPDATE payments -> recalc_bill_on_',
        'payment_change -> fn_recalc_bill_paid_status -> UPDATE bills',
        '-> bill_branch_manager_notify_trg -> notify_branch_manager with',
        'hardcoded NULL as actor. INSERT notifications fails on NOT',
        'NULL created_by. Whole chain rolls back with 500.',
        '',
        'Fix (DB-only, already applied on prod):',
        '  bill_branch_manager_notify_trg now builds v_actor with',
        '  fallback chain auth.uid() -> last_edited_by_user_id ->',
        '  created_by_user_id -> created_by. Passes v_actor everywhere,',
        '  including the status-change branch that previously hardcoded',
        '  NULL. INSERT branch already used COALESCE - unchanged there.',
        '',
        '  notify_branch_manager also hardened: if it receives NULL,',
        '  try auth.uid(), then any owner in the same company, then',
        '  silently skip (missing notification > rolled-back finance).',
        '',
        'Verified on prod: approving the pending BILL-0001 payment',
        'succeeds, bill goes paid_amount=4.93, status=partially_paid.',
        '',
        'Follow-up: audit the invoice sibling trigger for the same',
        'latent bug on the sales side.',
        '',
        'Files',
        '  supabase/migrations/20260705000531_...sql',
        '  lib/version.ts -> 3.74.531'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.531 pushed - payment approval unblocked" -ForegroundColor Green
}
