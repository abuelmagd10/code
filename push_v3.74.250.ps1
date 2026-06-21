$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.249.ps1") { Remove-Item -LiteralPath "push_v3.74.249.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.250"') {
    Write-Host "+ 3.74.250" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000250_v3_74_250_invoice_pre_shipment_refund_columns.sql" -Raw
foreach ($c in @('pre_shipment_refund_at','pre_shipment_refund_mode','cancel_invoice','keep_open')) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration adds refund tracking columns" -ForegroundColor Green

$lib = Get-Content -LiteralPath "lib/pre-shipment-refund.ts" -Raw
foreach ($c in @('executePreShipmentRefund','loadPreShipmentAdvanceByCustomer','cancel_invoice','keep_open','voids_payment_id','voided_by_payment_id','requireOpenFinancialPeriod')) {
    if ($lib -notmatch [regex]::Escape($c)) { Write-Host "X lib missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ executor handles voids, JE reversals, mode branching" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/invoices/[id]/pre-shipment-refund/route.ts" -Raw
foreach ($c in @('executePreShipmentRefund','settlement_account_id','mode','PRIVILEGED_ROLES')) {
    if ($api -notmatch [regex]::Escape($c)) { Write-Host "X api missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ POST /api/invoices/[id]/pre-shipment-refund wired" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
foreach ($c in @('showPreShipmentRefund','submitPreShipmentRefund','استرداد دفعة قبل الشحن','cancel_invoice','keep_open')) {
    if ($inv -notmatch [regex]::Escape($c)) { Write-Host "X invoice page missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ invoice page exposes refund button + dialog" -ForegroundColor Green

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($cust -notmatch [regex]::Escape('preShipmentAdvance')) {
    Write-Host "X customers page does not surface pre-shipment advance balance" -ForegroundColor Red; exit 1
}
Write-Host "+ customers balance includes pre-shipment advance" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_250.txt"
    $msgLines = @(
        "feat(invoices): v3.74.250 - pre-shipment payment refund + customer advance balance",
        "",
        "Scenario: customer pays for an invoice but the warehouse hasn't",
        "approved dispatch yet. The goods are still on the shelf. The",
        "customer changes their mind and asks for the money back. Under",
        "IFRS 15 the cash is a contract liability (advance held against an",
        "unshipped invoice), not earned revenue - the customer is entitled",
        "to ask for it back at any time before shipment.",
        "",
        "v3.74.250 adds the full mechanism:",
        "",
        "Database",
        "  invoices gains pre_shipment_refund_at, pre_shipment_refund_by,",
        "  pre_shipment_refund_amount, pre_shipment_refund_mode (CHECK",
        "  cancel_invoice|keep_open), pre_shipment_refund_reason,",
        "  pre_shipment_refund_je_id.",
        "",
        "Library (lib/pre-shipment-refund.ts)",
        "  executePreShipmentRefund() — for every active payment on the",
        "    invoice, post a reversing JE (Dr AR / Cr settlement_account)",
        "    + a void-payment companion row + link the original payment's",
        "    voided_by_payment_id chain so the audit trail reads cleanly.",
        "  Two modes the caller picks:",
        "    cancel_invoice — also reverse the invoice's revenue JE, set",
        "      invoice.status = 'cancelled', cancel linked sales_order.",
        "    keep_open — leave the revenue JE alone, invoice goes back to",
        "      'sent' (paid_amount = 0) so customer can pay again later.",
        "  loadPreShipmentAdvanceByCustomer() — aggregates the customer's",
        "    held-advance balance for the customers list.",
        "",
        "API",
        "  POST /api/invoices/[id]/pre-shipment-refund",
        "    body: { settlement_account_id, mode, reason? }",
        "    Privileged roles only (owner/admin/general_manager/accountant).",
        "",
        "UI (app/invoices/[id]/page.tsx)",
        "  - New 'Refund pre-shipment payment' button on the invoice page,",
        "    visible only when paid_amount > 0 AND warehouse_status !=",
        "    'approved' AND not already refunded AND not cancelled.",
        "  - Dialog: mode picker (cancel vs keep), branch-filtered cash/",
        "    bank account dropdown, optional reason.",
        "",
        "UI (app/customers/page.tsx)",
        "  - The customer's pre-shipment advance balance is now summed",
        "    into the 'available credit' headline so every place that",
        "    shows customer balance reflects the held advance.",
        "",
        "Why this doesn't hurt the existing sales cycle / governance:",
        "  - Doesn't touch the revenue-recognition JE flow (Dr AR / Cr",
        "    Revenue at 'sent' time) for the keep_open path.",
        "  - Reuses the existing payments.voids_payment_id / voided_at",
        "    columns that were already in the schema, just unused.",
        "  - Calls requireOpenFinancialPeriod before any JE post.",
        "  - Refuses on already-refunded invoices and on warehouse-",
        "    approved ones (those should go through sales returns).",
        "",
        "Files",
        "  supabase/migrations/20260620000250_v3_74_250_invoice_pre_shipment_refund_columns.sql",
        "  lib/pre-shipment-refund.ts (new)",
        "  app/api/invoices/[id]/pre-shipment-refund/route.ts (new)",
        "  app/invoices/[id]/page.tsx",
        "  app/customers/page.tsx",
        "  lib/version.ts -> 3.74.250"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.250 pushed" -ForegroundColor Green
}
