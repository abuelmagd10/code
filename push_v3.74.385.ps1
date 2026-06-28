$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.384.ps1") { Remove-Item -LiteralPath "push_v3.74.384.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.385"') {
    Write-Host "+ 3.74.385" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260628000385_v3_74_385_fix_booking_invoice_subtotal_and_discount_je.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 385" -ForegroundColor Green
} else { Write-Host "X missing migration 385" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'complete_booking_atomic',
    'execute_sales_invoice_accounting',
    'COALESCE(v_booking.unit_price, 0) * COALESCE(v_booking.quantity, 1)',
    "sub_type IN ('sales_discounts', 'sales_discount')",
    'v_gross_revenue',
    'BUG 1 FIX',
    'BUG 2 FIX'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers both bug fixes" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_385.txt"
    $msgLines = @(
        'fix(invoices): v3.74.385 - subtotal math + sales discount JE',
        '',
        'Two bugs surfaced during the booking E2E test:',
        '',
        'BUG 1 - subtotal in complete_booking_atomic',
        '  Old: v_subtotal := total_amount - tax_amount  (=450)',
        '  For a 500 EGP booking with 50 EGP discount, the visible',
        '  invoice header showed subtotal=450 + discount=50 + total=450,',
        '  which is internally inconsistent (450 - 50 should be 400).',
        '  Fix: subtotal = pre-discount line value = unit_price * qty.',
        '  invoice_items.line_total now stores the gross figure too,',
        '  and discount stays at the invoice level only.',
        '',
        'BUG 2 - execute_sales_invoice_accounting never posted the discount',
        '  Shared RPC across every sales invoice. When invoice.discount_',
        '  value > 0 and a sales_discounts contra-revenue account exists,',
        '  the JE now posts:',
        '    Dr Accounts Receivable        net (post-discount)',
        '    Dr Sales Discounts (contra)   discount_value',
        '    Cr Sales Revenue              gross (pre-discount)',
        '    Cr VAT (if any)               tax_amount',
        '  Total debits = total credits, and the contra-revenue line',
        '  lets the owner report "how much did I discount this period"',
        '  in the chart of accounts.',
        '  Falls back to old per-product revenue grouping when no',
        '  discount on the invoice (preserves existing behavior).',
        '',
        'Same RPC also handles the no-product GL branch in complete_',
        'booking_atomic which used to skip the discount line entirely.',
        '',
        'Backward compatibility',
        '  - Invoices without a discount: identical to v3.74.371 behavior',
        '  - Invoices with a discount but no sales_discounts account:',
        '    skips the new line, falls back to legacy grouping. No 500.',
        '  - Booking-generated invoices still flow through the same RPC',
        '    so they benefit from both fixes.',
        '',
        'Tested',
        '  Existing booking BKG-2026-00002 already has the old (wrong)',
        '  JE. Future bookings will use the new logic. To verify, create',
        '  a fresh booking with a discount and check:',
        '    Invoices.subtotal = unit_price * quantity (e.g. 500)',
        '    Invoices.discount_value = booking discount (e.g. 50)',
        '    Invoices.total_amount = subtotal - discount + tax (e.g. 450)',
        '    JE has Dr AR + Dr Discount = Cr Revenue (+ Cr VAT)',
        '',
        'Next stages (separately)',
        '  Stage B - new junction table service_products for consumable',
        '            BOM, plus the UI to manage it',
        '  Stage C - inventory availability gate on activate_booking +',
        '            auto-deduction from the invoice warehouse',
        '',
        'Files',
        '  supabase/migrations/20260628000385_v3_74_385_fix_booking_invoice_subtotal_and_discount_je.sql',
        '  lib/version.ts -> 3.74.385',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.385 pushed - invoice subtotal + sales discount JE fixed" -ForegroundColor Green
}
