$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.250.ps1") { Remove-Item -LiteralPath "push_v3.74.250.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.251"') {
    Write-Host "+ 3.74.251" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000251_v3_74_251_bill_pre_receipt_refund_columns.sql" -Raw
foreach ($c in @('pre_receipt_refund_at','pre_receipt_refund_mode','cancel_bill','keep_open')) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration adds refund tracking columns to bills" -ForegroundColor Green

$lib = Get-Content -LiteralPath "lib/pre-receipt-refund.ts" -Raw
foreach ($c in @('executePreReceiptRefund','loadPreReceiptAdvanceBySupplier','cancel_bill','keep_open','voids_payment_id','voided_by_payment_id','requireOpenFinancialPeriod','bill_reversal_pre_receipt')) {
    if ($lib -notmatch [regex]::Escape($c)) { Write-Host "X lib missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ executor handles voids, JE reversals, mode branching" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/bills/[id]/pre-receipt-refund/route.ts" -Raw
foreach ($c in @('executePreReceiptRefund','settlement_account_id','mode','PRIVILEGED_ROLES')) {
    if ($api -notmatch [regex]::Escape($c)) { Write-Host "X api missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ POST /api/bills/[id]/pre-receipt-refund wired" -ForegroundColor Green

$bill = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
foreach ($c in @('showPreReceiptRefund','استرداد دفعة قبل الاستلام','cancel_bill','keep_open','preReceiptRefundAccountId')) {
    if ($bill -notmatch [regex]::Escape($c)) { Write-Host "X bill page missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bill page exposes refund button + dialog" -ForegroundColor Green

$sup = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
foreach ($c in @('preReceiptAdvance','pre_receipt_refund_at','receipt_status')) {
    if ($sup -notmatch [regex]::Escape($c)) { Write-Host "X suppliers page missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ suppliers balance includes pre-receipt advance" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_251.txt"
    $msgLines = @(
        "feat(bills): v3.74.251 - pre-receipt payment refund + supplier advance balance",
        "",
        "Purchases-side mirror of v3.74.250. Closes the loop on the",
        "symmetric scenario: we paid the supplier on a bill but the",
        "warehouse hasn't confirmed receipt yet. Under IAS 2 / IFRS 9",
        "the prepayment is a vendor advance (asset on our books) and is",
        "refundable until the goods change hands.",
        "",
        "Database",
        "  bills gains pre_receipt_refund_at, pre_receipt_refund_by,",
        "  pre_receipt_refund_amount, pre_receipt_refund_mode (CHECK",
        "  cancel_bill|keep_open), pre_receipt_refund_reason,",
        "  pre_receipt_refund_je_id.",
        "",
        "Library (lib/pre-receipt-refund.ts)",
        "  executePreReceiptRefund() - for each active supplier payment,",
        "    post a reversing JE (Dr settlement_account / Cr AP) + a",
        "    void-payment companion row + link voided_by_payment_id so the",
        "    audit trail reads cleanly. Two modes:",
        "      cancel_bill - also reverse the bill JE, set bill.status =",
        "        'cancelled', cancel linked purchase_order.",
        "      keep_open  - leave the bill JE alone, bill goes back to",
        "        'pending' (paid_amount = 0) so the supplier can be re-",
        "        paid later.",
        "  loadPreReceiptAdvanceBySupplier() - aggregates the held advance",
        "    per supplier for the suppliers list.",
        "",
        "API",
        "  POST /api/bills/[id]/pre-receipt-refund",
        "    body: { settlement_account_id, mode, reason? }",
        "    Privileged roles only.",
        "",
        "UI (app/bills/[id]/page.tsx)",
        "  - New 'Refund pre-receipt payment' button next to the existing",
        "    receipt-approval / receipt-reject buttons. Visible only when",
        "    paid_amount > 0 AND receipt_status != 'received' AND not",
        "    already refunded AND not cancelled.",
        "  - Dialog mirrors the sales-side one: mode picker, branch-",
        "    filtered cash/bank dropdown, optional reason.",
        "",
        "UI (app/suppliers/page.tsx)",
        "  - The supplier's pre-receipt advance balance is now summed into",
        "    the 'debitCredits' headline so every place that shows the",
        "    supplier balance reflects the held advance.",
        "",
        "Files",
        "  supabase/migrations/20260620000251_v3_74_251_bill_pre_receipt_refund_columns.sql",
        "  lib/pre-receipt-refund.ts (new)",
        "  app/api/bills/[id]/pre-receipt-refund/route.ts (new)",
        "  app/bills/[id]/page.tsx",
        "  app/suppliers/page.tsx",
        "  lib/version.ts -> 3.74.251"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.251 pushed" -ForegroundColor Green
}
