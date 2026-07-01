$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.444.ps1") { Remove-Item -LiteralPath "push_v3.74.444.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.445"') {
    Write-Host "+ 3.74.445" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000445_v3_74_445_paymob_audit_fixes.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 445 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AR\. ?Paymob audit fixes') {
    Write-Host "X CONTRACTS.md missing Section AR" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AR" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_445.txt"
    $msgLines = @(
        'fix(billing): v3.74.445 - close paymob webhook audit gaps at DB level',
        '',
        'Audit found two gaps:',
        '',
        '(1) handlePaymentFailed flips subscription_status to past_due',
        '    without stamping past_due_at. Without that, the',
        '    daily_billing_check grace-period math never triggers a',
        '    suspend. Companies stay past_due forever.',
        '',
        '(2) The TS code uses "canceled" (US). can_write_to_company',
        '    was checking "cancelled" (UK). A cancelled company kept',
        '    write access because the check missed.',
        '',
        'Both fixed at DB level with no webhook redeploy:',
        '',
        'Trigger companies_subscription_status_transitions',
        '   BEFORE UPDATE OF subscription_status on companies',
        '   past_due       -> auto-stamp past_due_at  if null',
        '   payment_failed -> auto-stamp suspended_at if null',
        '   active         -> clear past_due_at + suspended_at,',
        '                     stamp reactivated_at',
        '   Fires from webhook path, cron path, and manual admin action.',
        '',
        'can_write_to_company now blocks both cancelled AND canceled.',
        '',
        'Round-trip smoke test passed in DB.',
        '',
        'Baseline (Section AR) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000445_v3_74_445_paymob_audit_fixes.sql',
        '   CONTRACTS.md (Section AR added)',
        '   lib/version.ts -> 3.74.445'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.445 pushed - paymob audit gaps closed" -ForegroundColor Green
}
