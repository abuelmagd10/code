$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.175.ps1") { Remove-Item -LiteralPath "push_v3.74.175.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.176"') { Write-Host "+ 3.74.176" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "app/dashboard/_widgets/CustomerSupplierBalancesWidget.tsx")) {
    Write-Host "X widget file missing" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "components/DashboardCustomerSupplierBalances.tsx")) {
    Write-Host "X card component missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ widget + card component present" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/dashboard/page.tsx" -Raw
if ($page -notmatch "CustomerSupplierBalancesWidget") {
    Write-Host "X dashboard page does not render the new widget" -ForegroundColor Red
    exit 1
}
Write-Host "+ dashboard page wires the widget" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_176.txt"
    $msgLines = @(
        "feat(dashboard): v3.74.176 - two cards for customer credit + supplier advance",
        "",
        "Tester audit found that the dashboard had no standalone view for",
        "customer credit balance or supplier advance balance. The closest",
        "thing was a tiny sub-line under the AR / AP cards that only showed",
        "when the GL ledger went negative. That hid the operational truth -",
        "for example BILL-0002 still has 3 EGP open as a vendor credit on",
        "the supplier ledger, but GL AP is zero, so the dashboard rendered",
        "nothing.",
        "",
        "Added two new cards, mirroring what /customers and /suppliers show.",
        "",
        "Files:",
        "",
        "  app/dashboard/_widgets/CustomerSupplierBalancesWidget.tsx (new)",
        "    - Async server component that fetches both balances.",
        "    - Customer credit: SUM(customer_credit_ledger.amount) joined",
        "      to customers.branch_id so the branch filter applies on the",
        "      customer's branch.",
        "    - Supplier advance: SUM(GREATEST(0, total_amount -",
        "      applied_amount)) on vendor_credits where status='open',",
        "      joined to suppliers.branch_id.",
        "    - Reads branchId from the same widgetCtx the other widgets",
        "      consume, so the user's branch governance flows through.",
        "      branchId null/undefined aggregates across branches; set =",
        "      the user's branch filters to that branch only.",
        "",
        "  components/DashboardCustomerSupplierBalances.tsx (new)",
        "    - Two side-by-side gradient cards (emerald + purple).",
        "    - Bilingual labels: 'رصيد العملاء الدائن' / 'مستحقات لنا",
        "      (سلفة مورد)' + English fallback.",
        "    - Renders 0.00 with 'No open credits / advances' tag when the",
        "      balance is zero so the cards stay visible even on a clean",
        "      ledger.",
        "",
        "  app/dashboard/page.tsx",
        "    - Imports the widget.",
        "    - Renders it inside a Suspense, immediately after the",
        "      existing Secondary Stats widget. Same widgetCtx so branch",
        "      governance is identical.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.176.",
        "",
        "How to verify:",
        "  - Owner: dashboard renders both cards across all branches.",
        "    For company 8ef6338c-... the Supplier Advance card should",
        "    show 3.00 EGP (the open VC-BILL-0002-... row).",
        "  - Branch accountant in مدينة نصر: same numbers because the",
        "    open credit is in their branch.",
        "  - Branch accountant in another branch: both cards show 0.00",
        "    with the 'No open ...' tag.",
        "",
        "Why this is sourced from the operational ledger and not GL:",
        "  GL accounts_receivable / accounts_payable nets every direction",
        "  together. A cash-settled supplier refund closes the vendor_",
        "  credit and disappears from the GL view, but the supplier",
        "  ledger still tracks it as an open advance until something",
        "  applies or zeros it. The operational view matches what the",
        "  detail pages already display, so the numbers reconcile by",
        "  inspection."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.176 pushed" -ForegroundColor Green
}
