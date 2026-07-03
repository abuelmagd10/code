$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.513.ps1") { Remove-Item -LiteralPath "push_v3.74.513.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.514"') {
    Write-Host "+ 3.74.514" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260703000514_v3_74_514_bill_item_lock_allow_returned_qty.sql")) {
    Write-Host "X migration 514 missing" -ForegroundColor Red; exit 1
}

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
# فحص مخصص بالجدول: السندات البنكية لا تملك approved_at/rejected_at،
# وإشعارات مدين العملاء لا تملك rejected_at (المصروفات تملكها — لا تُفحص)
if ($ap -match 'bank_voucher_requests"\)\.select\(`[^`]*approved_at') {
    Write-Host "X bank voucher history selects non-existent approved_at" -ForegroundColor Red; exit 1
}
if ($ap -match 'customer_debit_notes"\)\.select\(`[^`]*rejected_at') {
    Write-Host "X customer debit notes history selects non-existent rejected_at" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'reviewed_at') {
    Write-Host "X bank voucher history missing reviewed_at" -ForegroundColor Red; exit 1
}
Write-Host "+ returned-qty bookkeeping allowed + history 400s fixed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_514.txt"
    $msgLines = @(
        'fix(returns): v3.74.514 - goods-out confirmation unblocked',
        '',
        'Store manager clicked Confirm Goods-Out on PRET-5689 and got a',
        '500: "cannot edit items of a posted bill". Root cause:',
        'confirm_purchase_return_delivery_v2 records returned_quantity on',
        'bill_items, but bill_item_protect_posted_trg (a later hardening)',
        'blocks ALL item mutations on non-draft bills and the RPC predates',
        'the app.skip_po_lock bypass.',
        '',
        'Fix (migration 514, already applied to production): the trigger',
        'now allows an UPDATE whose only diff is returned_quantity',
        '(+updated_at) - the bookkeeping the returns workflow performs.',
        'Any other edit on a posted bill item stays blocked as before.',
        '',
        'Also fixed two silent history 400s introduced with the misc',
        'history section: bank_voucher_requests has reviewed_at (not',
        'approved_at/rejected_at) and customer_debit_notes has no',
        'rejected_at column.',
        '',
        'Files',
        '  supabase/migrations/20260703000514_v3_74_514_bill_item_lock_allow_returned_qty.sql',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.514'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.514 pushed - returns goods-out flow unblocked" -ForegroundColor Green
}
