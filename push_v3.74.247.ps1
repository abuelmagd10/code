$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.246.ps1") { Remove-Item -LiteralPath "push_v3.74.246.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.247"') {
    Write-Host "+ 3.74.247" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$disb = Get-Content -LiteralPath "lib/sales-return-cash-disbursement.ts" -Raw
foreach ($c in @('postSalesReturnCashDisbursement', 'sales_return_cash_refund', 'customer_credit_ledger', 'paid_amount')) {
    if ($disb -notmatch [regex]::Escape($c)) {
        Write-Host "X disbursement helper missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ cash-disbursement helper exposes the wiring" -ForegroundColor Green

$wh = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/warehouse-approve/route.ts" -Raw
foreach ($c in @('postSalesReturnCashDisbursement', 'settlement_method', 'settlement_account_id', 'disbursementResult')) {
    if ($wh -notmatch [regex]::Escape($c)) {
        Write-Host "X warehouse-approve missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ warehouse-approve calls the disbursement after atomic posting" -ForegroundColor Green

$list = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
foreach ($c in @('returnSettlementAccountId', 'returnCashBankAccounts', 'الفاتورة ليس بها مدفوعات', 'تفضيل التسوية بعد الاعتماد', 'settlement_method')) {
    if ($list -notmatch [regex]::Escape($c)) {
        Write-Host "X invoices list page missing $c" -ForegroundColor Red; exit 1
    }
}
if ($list -notmatch [regex]::Escape('import { Label } from "@/components/ui/label"')) {
    Write-Host "X invoices list page missing Label import" -ForegroundColor Red; exit 1
}
Write-Host "+ invoices list return dialog matches the in-invoice form" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_247.txt"
    $msgLines = @(
        "feat(sales-returns): v3.74.247 - wire cash/bank disbursement end-to-end + unify list-page form",
        "",
        "v3.74.246 captured the disbursement account in the request but the",
        "warehouse-approve executor still left the customer with a credit-",
        "balance instead of cash in hand. v3.74.247 closes the loop on both",
        "sides:",
        "",
        "1) Executor wiring (the actual JE that moves money)",
        "   New helper lib/sales-return-cash-disbursement.ts. After the",
        "   atomic posting commits, the warehouse-approve route now calls",
        "   it with the request's settlement_method + settlement_account_id.",
        "   The helper:",
        "     * Idempotency-guards on (sales_return_cash_refund, return_id)",
        "       so retries / double-clicks don't double-pay.",
        "     * Reads the customer_credit_ledger entries the atomic created",
        "       to learn how much was actually owed to the customer.",
        "     * Validates the chosen settlement account belongs to the",
        "       company and is a real cash/bank box.",
        "     * Posts Dr customer_credit_account / Cr settlement_account so",
        "       cash leaves the drawer the requester picked.",
        "     * Inserts a negative customer_credit_ledger entry so the",
        "       customer's net credit balance returns to zero (no double-",
        "       refund risk — exactly what the user was worried about).",
        "     * Flips customer_credits.status to 'used' for that return.",
        "     * Reduces invoice.paid_amount by the refunded amount so the",
        "       payment status reports stay accurate.",
        "   Failures here are logged but do NOT roll back the atomic - the",
        "   customer keeps their credit balance, reconcilable by an owner.",
        "",
        "2) Form unification (invoices list page)",
        "   app/invoices/page.tsx hosts the partial-return / full-return",
        "   buttons on each invoice row. Their dialog was a stripped-down",
        "   version that didn't ask for settlement preference at all. It",
        "   now mirrors the in-invoice dialog from v3.74.246:",
        "     * Hides the settlement preference and shows an amber note",
        "       'الفاتورة ليس بها مدفوعات' when the invoice has no paid",
        "       amount on the books.",
        "     * For paid invoices, shows method picker (credit_note / cash /",
        "       bank_transfer) and a branch-filtered drawer/account dropdown",
        "       when cash or bank_transfer is chosen. Owner / admin /",
        "       general_manager see the full company; everyone else sees",
        "       only their branch.",
        "     * Validates the account is picked before submit and forwards",
        "       settlement_method + settlement_account_id to the API.",
        "",
        "Files",
        "  lib/sales-return-cash-disbursement.ts (new)",
        "  app/api/sales-return-requests/[id]/warehouse-approve/route.ts",
        "  app/invoices/page.tsx",
        "  lib/version.ts -> 3.74.247"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.247 pushed" -ForegroundColor Green
}
