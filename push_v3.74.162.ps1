$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.161.ps1") { Remove-Item -LiteralPath "push_v3.74.161.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.162"') { Write-Host "+ 3.74.162" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity check: useMemo for filteredCustomerPayments must still come BEFORE `if (loading)`
$page = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
$idxMemo = $page.IndexOf('const filteredCustomerPayments = useMemo')
$idxLoading = $page.IndexOf('if (loading) {')
if ($idxMemo -lt 0 -or $idxLoading -lt 0 -or $idxMemo -gt $idxLoading) {
    Write-Host "X Hooks-order regression: useMemo not above 'if (loading)'" -ForegroundColor Red
    exit 1
}
Write-Host "+ Hooks order intact (memos above early-return)" -ForegroundColor Green

# Sanity check: MultiSelect imported and new state present
if ($page -notmatch 'import \{ MultiSelect \} from "@/components/ui/multi-select"') {
    Write-Host "X MultiSelect import missing" -ForegroundColor Red
    exit 1
}
if ($page -notmatch 'cpCustomerIds' -or $page -notmatch 'spSupplierIds' -or $page -notmatch 'cpUnlinkedOnly' -or $page -notmatch 'spUnlinkedOnly') {
    Write-Host "X v3.74.162 state declarations missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ Customer/Supplier dropdown + unlinked toggle wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_162.txt"
    $msgLines = @(
        "feat(payments): v3.74.162 - searchable party dropdown + unlinked filter",
        "",
        "User feedback after v3.74.161: the filter bar only had free-text",
        "search and status/date pills. To match the pattern in /invoices",
        "(MultiSelect-based searchable dropdown) and to give the accountant",
        "a quick way to spot advance payments, add two filters per section.",
        "",
        "1) Searchable party dropdown (MultiSelect from /invoices)",
        "   - Customer Payments section: 'العَميل' dropdown listing every",
        "     customer the user can see, with a search box inside. Multi-",
        "     select so they can compare two parties side by side.",
        "   - Supplier Payments section: same, against the suppliers list.",
        "   - Backed by cpCustomerIds and spSupplierIds state.",
        "",
        "2) 'Unlinked only' toggle",
        "   - Customer Payments: hides any payment that already points to",
        "     an invoice (payments.invoice_id IS NOT NULL). The remaining",
        "     rows are customer overpayments / advances not yet applied",
        "     to any invoice.",
        "   - Supplier Payments: hides any payment whose row has bill_id",
        "     OR has a payment_allocations row pointing at a bill. The",
        "     remaining rows are the vendor advances - exactly what the",
        "     accountant looks for when chasing 'مستحقات لنا (سلفة مورد)'.",
        "   - Backed by cpUnlinkedOnly and spUnlinkedOnly state.",
        "",
        "Files:",
        "  app/payments/page.tsx",
        "    - Adds MultiSelect import from components/ui/multi-select",
        "      (same component /invoices uses).",
        "    - 4 new state slots (cpCustomerIds, spSupplierIds, cpUnlinkedOnly,",
        "      spUnlinkedOnly).",
        "    - applyPaymentFilters() gains partyIds + partyIdFor + unlinkedOnly",
        "      + isLinkedFor params. The useMemo dependency arrays are updated",
        "      to include allocBillByPayment so the supplier unlinked filter",
        "      stays in sync when allocations finish loading.",
        "    - cpActive / spActive count the two new filters; clearCpFilters",
        "      / clearSpFilters reset them.",
        "    - renderPaymentFilters() takes the new params and renders a 2-",
        "      column row above the existing status/date grid: MultiSelect on",
        "      the left, an 'Unlinked only' toggle button on the right. Both",
        "      call sites pass section-specific labels + party options.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.162.",
        "",
        "How to verify:",
        "  - Open /payments. Each section's filter panel now shows a",
        "    'العَميل' / 'المُورِّد' dropdown with search inside.",
        "  - Pick one or more parties - the table narrows to just those.",
        "  - Click 'غَير المُرتَبِطَة بفاتورَة فَقَط' on Customer Payments to see",
        "    overpayments / on Supplier Payments to see vendor advances.",
        "  - The 'الفلاتر' badge increments and 'مسح الكل' resets the new",
        "    filters too."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.162 pushed" -ForegroundColor Green
}
