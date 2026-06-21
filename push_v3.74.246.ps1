$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.245.ps1") { Remove-Item -LiteralPath "push_v3.74.245.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.246"') {
    Write-Host "+ 3.74.246" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000246_v3_74_246_sales_return_request_settlement_account.sql" -Raw
foreach ($c in @('settlement_method', 'settlement_account_id', 'chart_of_accounts')) {
    if ($mig -notmatch [regex]::Escape($c)) {
        Write-Host "X migration missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration adds settlement_method + settlement_account_id" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/sales-return-requests/route.ts" -Raw
foreach ($c in @('settlement_method', 'settlement_account_id')) {
    if ($api -notmatch [regex]::Escape($c)) {
        Write-Host "X api route does not persist $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ api/sales-return-requests persists the settlement preference" -ForegroundColor Green

$ui = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
foreach ($c in @('returnSettlementAccountId', 'الفاتورة ليس بها مدفوعات', 'showPartialReturn')) {
    if ($ui -notmatch [regex]::Escape($c)) {
        Write-Host "X invoice page missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ invoice return dialog asks for the disbursement account" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_246.txt"
    $msgLines = @(
        "feat(sales-returns): v3.74.246 - capture the disbursement account on the return request",
        "",
        "Why: the create-return-request dialog lets the requester pick a",
        "settlement method (credit_note / cash / bank_transfer), but the",
        "form never let them pick WHICH cash drawer or bank account the",
        "refund should come out of. Down the line the executor fell back to",
        "the original payment account, which is the wrong operational",
        "primitive for a real cashier - they want to refund from the drawer",
        "they're standing at, in their branch.",
        "",
        "Changes",
        "  - DB: add settlement_method (text) and settlement_account_id (uuid)",
        "    to sales_return_requests so the choice is persisted with the",
        "    request and survives the multi-level approval workflow.",
        "  - API: /api/sales-return-requests accepts and stores both fields,",
        "    nulling settlement_account_id for credit_note.",
        "  - UI (app/invoices/[id]/page.tsx):",
        "      * For an UNPAID invoice the settlement-preference block is",
        "        hidden and replaced with an amber note: 'الفاتورة ليس بها",
        "        مدفوعات' - nothing to settle, the return only reverses",
        "        revenue and restocks inventory.",
        "      * For a PAID invoice the method picker stays. Choosing cash",
        "        shows a dropdown of cash accounts; choosing bank_transfer",
        "        shows the bank accounts. The list is branch-filtered for",
        "        regular roles and shows every account in the company for",
        "        owner / admin / general_manager.",
        "      * Validation: cash / bank_transfer can't submit without a",
        "        chosen settlement account.",
        "      * A dedicated useEffect loads the accounts the moment the",
        "        return dialog opens, so it works even when the user didn't",
        "        open the payment dialog first.",
        "",
        "Next step (v3.74.247): wire the warehouse-approve executor to",
        "actually post Dr AR / Cr SettlementAccount against the chosen",
        "drawer and reconcile the customer_credit, so the request UI choice",
        "drives the accounting effect end to end.",
        "",
        "Files",
        "  supabase/migrations/20260620000246_v3_74_246_sales_return_request_settlement_account.sql",
        "  app/api/sales-return-requests/route.ts",
        "  app/invoices/[id]/page.tsx",
        "  lib/version.ts -> 3.74.246"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.246 pushed" -ForegroundColor Green
}
