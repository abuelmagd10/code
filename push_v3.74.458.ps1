$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.456.ps1") { Remove-Item -LiteralPath "push_v3.74.456.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.458"') {
    Write-Host "+ 3.74.458" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($m in @('20260630000457_v3_74_457_widen_bill_invoice_watch.sql',
                 '20260630000458_v3_74_458_amendment_guard_full_scope.sql')) {
    if (-not (Test-Path "supabase/migrations/$m")) {
        Write-Host "X migration $m missing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migrations 457 + 458 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BD\. ?توسيع change detection' -or $contracts -notmatch 'BE\. ?حماية شاملة') {
    Write-Host "X CONTRACTS.md missing Section BD or BE" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Sections BD + BE" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_458.txt"
    $msgLines = @(
        'fix(discounts): v3.74.457+458 - comprehensive amendment guard on draft bill/invoice',
        '',
        'Owner asked: what happens if the accountant edits ANY field on',
        'a draft bill/invoice auto-created from an approved PO/SO?',
        'Before: only discount_value/type were watched. Shipping, tax,',
        'adjustment, currency, exchange rate, supplier/customer swap,',
        'and item edits all bypassed the approval cycle silently.',
        '',
        'v3.74.457',
        '   bill_request + inv_request discount triggers widened the',
        '   change-detection shortcut to include discount_position',
        '   and tax_inclusive.',
        '',
        'v3.74.458',
        '   Four new triggers:',
        '   bill_amendment_reset_approval (BEFORE UPDATE bills)',
        '   invoice_amendment_reset_approval (BEFORE UPDATE invoices)',
        '     detect a material change across:',
        '       shipping, shipping_tax_rate, adjustment, tax_amount,',
        '       subtotal, total_amount, currency, exchange_rate,',
        '       supplier/customer swap',
        '     cancel any current approved/pending discount_approval',
        '     so the next save opens a fresh pending row.',
        '   bill_item / invoice_item _amendment_reset_approval',
        '     same treatment for line-item INS/UPD/DEL while parent',
        '     is draft.',
        '',
        'The auto-create path from approve_purchase_order_atomic sets',
        'app.skip_discount_approval=po during INSERT; all four new',
        'triggers honor the flag, so auto-creation is unaffected.',
        '',
        'Files',
        '   supabase/migrations/20260630000457_v3_74_457_widen_bill_invoice_watch.sql',
        '   supabase/migrations/20260630000458_v3_74_458_amendment_guard_full_scope.sql',
        '   CONTRACTS.md (Sections BD + BE added)',
        '   lib/version.ts -> 3.74.458'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.458 pushed - amendment guard is comprehensive" -ForegroundColor Green
}
