$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.159.ps1") { Remove-Item -LiteralPath "push_v3.74.159.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.160"') { Write-Host "+ 3.74.160" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_160.txt"
    $msgLines = @(
        "feat(payments): v3.74.160 - unified filter bar matching other pages",
        "",
        "The /payments page rendered the customer and supplier payment",
        "tables without the FilterContainer pattern that /invoices,",
        "/bills, /customers, /sales-orders and the rest of the project",
        "already use. The accountant had no way to narrow the list by",
        "status, date range, or free-text search inside the table.",
        "",
        "This commit replicates the unified pattern on both sections.",
        "",
        "Files:",
        "  app/payments/page.tsx",
        "    - Imports FilterContainer from @/components/ui/filter-container",
        "      (the same component every other page uses) and useMemo from",
        "      React.",
        "    - Adds two parallel sets of filter state: cpSearch/cpStatus/",
        "      cpDateFrom/cpDateTo for customer payments and spSearch/",
        "      spStatus/spDateFrom/spDateTo for supplier payments.",
        "    - applyPaymentFilters() is a small helper that filters a",
        "      payments array by search (matches payment_number,",
        "      reference_number, notes and the party name resolved from",
        "      the customers/suppliers maps), multi-select status, and",
        "      payment_date range.",
        "    - filteredCustomerPayments + filteredSupplierPayments are",
        "      memoised against their respective filter state and the",
        "      raw list, then consumed by the .map() that renders the",
        "      table body (was customerPayments.map / supplierPayments.map).",
        "    - cpActive / spActive count the live filters; clearCpFilters",
        "      / clearSpFilters reset them.",
        "    - renderPaymentFilters() returns a FilterContainer that",
        "      mirrors the layout used elsewhere in the project: full-",
        "      width search input on top, then a three-column row with",
        "      multi-select status chips, From date, To date. Labels and",
        "      placeholders are bilingual (AR/EN).",
        "    - Two instances are placed in the page, one above each",
        "      payments Card.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.160.",
        "",
        "Notes:",
        "  - Filters are client-side. The page already fetches the full",
        "    list of payments the user can see (governance enforced via",
        "    the existing branch / created_by filters and RLS), so",
        "    filtering on top doesn't open a data window.",
        "  - Reusing FilterContainer means the collapsed-by-default,",
        "    badge-with-active-count, and 'Clear all' button behaviours",
        "    come for free and match every other page.",
        "",
        "How to verify:",
        "  - Open /payments. Each table now carries a 'الفلاتر' header.",
        "  - Type part of a reference number or party name into the",
        "    search box - the list narrows live.",
        "  - Click one or more status chips - same.",
        "  - Pick a From/To date - same.",
        "  - The badge next to 'الفلاتر' shows how many filters are",
        "    active; the X button next to it clears them all."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.160 pushed" -ForegroundColor Green
}
