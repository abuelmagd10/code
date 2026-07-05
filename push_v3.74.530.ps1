$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.530"') {
    Write-Host "+ 3.74.530" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260704000530_v3_74_530_close_overpayment_holes.sql" -Raw
if ($mig -notmatch 'FOR v_alloc IN[\s\S]+FROM payment_allocations pa') {
    Write-Host "X migration missing allocation loop in prevent_bill_overpayment" -ForegroundColor Red; exit 1
}
if ($mig -notmatch 'prevent_return_creating_overpay') {
    Write-Host "X migration missing prevent_return_creating_overpay function" -ForegroundColor Red; exit 1
}
if ($mig -notmatch 'trg_prevent_return_creating_overpay') {
    Write-Host "X migration missing new trigger" -ForegroundColor Red; exit 1
}
Write-Host "+ migration content verified (both fixes present)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_530.txt"
    $msgLines = @(
        'security(purchase): v3.74.530 - close two overpayment holes',
        '',
        'Audit finding after user question about return-during-pending-',
        'payment scenario. Two real holes in the purchase governance:',
        '',
        '1. prevent_bill_overpayment trigger short-circuits when',
        '   NEW.bill_id IS NULL. In this app bill links live in',
        '   payment_allocations, so payments.bill_id is always NULL for',
        '   allocation-based payments. The check was dead code for the',
        '   modern flow. Owner approving a payment on a bill that had',
        '   been partially/fully returned since creation would silently',
        '   record paid > net owed.',
        '',
        '2. process_purchase_return_atomic (and any UPDATE flipping to',
        '   completed) had no gate on pending payments. A user with',
        '   return permission could return items and shrink outstanding',
        '   below queued payments, then owner approval would overpay.',
        '',
        'Fixes (DB-only migration, already applied on prod):',
        '',
        '  prevent_bill_overpayment rewritten to loop payment_',
        '  allocations when NEW.bill_id IS NULL. Converts each allocation',
        '  to bill currency (same math as fn_recalc_bill_paid_status).',
        '  Blocks with P0001 OVERPAYMENT_BLOCKED including the numbers',
        '  the user needs to understand the reason.',
        '',
        '  New trg_prevent_return_creating_overpay BEFORE UPDATE on',
        '  purchase_returns. Fires when workflow_status transitions to',
        '  confirmed/completed. Computes net_after = total - returned',
        '  (current) - this_return - other_pending_returns and blocks',
        '  with P0001 RETURN_WOULD_CAUSE_OVERPAY when (approved_paid',
        '  + pending_payment) exceeds net_after. Error message says to',
        '  cancel/reject the pending payment first.',
        '',
        'Tests on prod DB:',
        '  * pay 4.93 EGP allowed at net=6.31: passes',
        '  * return 5 EGP with pending 4.93 payment: BLOCKED as designed',
        '  * return 1 EGP (net_after 5.31 >= pending 4.93): allowed',
        '',
        'Files',
        '  supabase/migrations/20260704000530_v3_74_530_close_overpayment_holes.sql',
        '  lib/version.ts -> 3.74.530'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.530 pushed - overpayment loopholes closed" -ForegroundColor Green
}
