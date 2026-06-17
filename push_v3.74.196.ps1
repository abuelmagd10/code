$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.193.ps1") { Remove-Item -LiteralPath "push_v3.74.193.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.196"') {
    Write-Host "+ 3.74.196" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$migs = @(
    "supabase/migrations/20260617000194_v3_74_194_get_suppliers_overview.sql",
    "supabase/migrations/20260617000195_v3_74_195_get_invoices_payload.sql",
    "supabase/migrations/20260617000196_v3_74_196_get_bills_payload.sql"
)
foreach ($m in $migs) {
    if (-not (Test-Path -LiteralPath $m)) {
        Write-Host "X missing $m" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ 3 migration files present" -ForegroundColor Green

$sup = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($sup -notmatch "get_suppliers_overview") { Write-Host "X suppliers page not wired" -ForegroundColor Red; exit 1 }
if ($sup -notmatch "loadSuppliersInFlightRef") { Write-Host "X suppliers missing guard" -ForegroundColor Red; exit 1 }
Write-Host "+ suppliers wired" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
if ($inv -notmatch "get_invoices_payload") { Write-Host "X invoices page not wired" -ForegroundColor Red; exit 1 }
if ($inv -notmatch "loadDataInFlightRef") { Write-Host "X invoices missing guard" -ForegroundColor Red; exit 1 }
Write-Host "+ invoices wired" -ForegroundColor Green

$bill = Get-Content -LiteralPath "app/bills/page.tsx" -Raw
if ($bill -notmatch "get_bills_payload") { Write-Host "X bills page not wired" -ForegroundColor Red; exit 1 }
if ($bill -notmatch "loadDataInFlightRef") { Write-Host "X bills missing guard" -ForegroundColor Red; exit 1 }
Write-Host "+ bills wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_196.txt"
    $msgLines = @(
        "perf: v3.74.194 + v3.74.195 + v3.74.196 - close the list-page audit",
        "",
        "Follow-up to v3.74.193 (customers). The same anti-patterns existed on",
        "three more list pages; this commit applies the same single-RPC fix to",
        "each of them. Governance is preserved end-to-end: every RPC is",
        "SECURITY INVOKER so RLS on the underlying tables applies as if the",
        "page had queried them directly, branch and role-based filters are",
        "passed through as parameters (not added by the RPC), and no",
        "permission or access-control logic moved out of the application.",
        "",
        "v3.74.194 - suppliers",
        "  Before: loadSupplierBalances iterated every supplier and fired 3",
        "          SELECTs per row (bills + vendor_credits + advance payments).",
        "          100 suppliers = 300+ round-trips. Worst N+1 in the codebase.",
        "  After:  get_suppliers_overview returns each supplier with payables /",
        "          open_credits / bill_overpayments / advances precomputed in",
        "          one round-trip. concurrency guard on loadSuppliers.",
        "",
        "v3.74.195 - invoices",
        "  Before: After /api/invoices, the page made 6+ dependent SELECTs",
        "          (sales_return_requests + payments + invoice_items +",
        "          sales_returns + sales_return_items + invoices for the",
        "          employee map + sales_orders).",
        "  After:  get_invoices_payload bundles payments + items +",
        "          returned-by-item + invoice_to_employee +",
        "          active_return_requests in one call. Concurrency guard on",
        "          loadData. Page-wide reference lists (customers, products,",
        "          shipping_providers, customer_credits) keep their existing",
        "          single-query loads - they were already fine.",
        "",
        "v3.74.196 - bills",
        "  Before: 5 dependent SELECTs on payments + bill_items +",
        "          vendor_credits + vendor_credit_items + open-VC aggregation.",
        "  After:  get_bills_payload covers all five in one call. Both the",
        "          cache-hit and cache-miss paths now use the same RPC, so",
        "          revisiting a cached page is also one round-trip.",
        "          Concurrency guard on loadData.",
        "",
        "Receivables / payables / balances are mathematically equivalent to",
        "the old client-side aggregates - same formulas, same status filters,",
        "moved into SQL CTEs. The dashboard integrity checks (ic_ap_balance /",
        "ic_ar_balance) still gate any divergence.",
        "",
        "Indexes added on the join keys each RPC touches so the aggregates",
        "stay cheap as the company's data grows.",
        "",
        "Files:",
        "  supabase/migrations/20260617000194_v3_74_194_get_suppliers_overview.sql",
        "  supabase/migrations/20260617000195_v3_74_195_get_invoices_payload.sql",
        "  supabase/migrations/20260617000196_v3_74_196_get_bills_payload.sql",
        "  app/suppliers/page.tsx",
        "  app/invoices/page.tsx",
        "  app/bills/page.tsx",
        "  lib/version.ts"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.196 pushed (3 list pages refactored)" -ForegroundColor Green
}
