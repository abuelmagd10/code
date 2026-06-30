$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.418.ps1") { Remove-Item -LiteralPath "push_v3.74.418.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.419"') {
    Write-Host "+ 3.74.419" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000419_v3_74_419_close_discount_approval_gaps.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 419 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'S\. سد ٤ ثغرات فى دورة اعتماد الخصم') {
    Write-Host "X CONTRACTS.md missing Section S" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section S" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_419.txt"
    $msgLines = @(
        'feat(approvals): v3.74.419 - close 4 gaps in discount-approval flow',
        '',
        '1) approve_purchase_order_atomic — rejected-discount gate',
        '   The gate only blocked when the latest discount approval was',
        '   pending. If the approver rejected the discount, the PO',
        '   could still be approved with a rejected discount sitting',
        '   beside it. New behaviour: reads the latest approval status,',
        '   blocks both pending AND rejected, and returns clear Arabic',
        '   messages telling the owner what to do.',
        '',
        '2) inv_request_discount_approval_trg — no double-cycle from SO',
        '   When the invoice carries a sales_order_id, the trigger now',
        '   looks at the SO discount approval first. If it is approved',
        '   with the same value+type, no new invoice-level approval is',
        '   created (the same discount stays approved end-to-end). If',
        '   it is rejected, the trigger RAISEs so the invoice cannot be',
        '   created at all.',
        '',
        '3) notify_discount_decision_trg — close the silence gap',
        '   AFTER UPDATE OF status on discount_approvals: when status',
        '   moves to approved or rejected, insert a notification for',
        '   the original requester with the title and reason. The user',
        '   stops finding out by polling the inbox.',
        '',
        '4) Same trigger as (2) covers "block SO→Invoice on rejected',
        '   discount" because the RAISE happens inside the invoice',
        '   insert path.',
        '',
        'Baseline (Section S)',
        '   - function notify_discount_decision_trg exists',
        '   - trigger discount_approval_notify_decision exists',
        '   - approve_purchase_order_atomic body must contain',
        '     v_last_disc_status AND v_last_disc_status = ''rejected''',
        '   - inv_request_discount_approval_trg body must reference',
        '     NEW.sales_order_id',
        '',
        'Files',
        '   supabase/migrations/20260630000419_v3_74_419_close_discount_approval_gaps.sql',
        '   CONTRACTS.md (Section S added)',
        '   lib/version.ts -> 3.74.419'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.419 pushed - 4 discount-approval gaps closed" -ForegroundColor Green
}
