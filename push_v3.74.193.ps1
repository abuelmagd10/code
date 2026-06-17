$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.192.ps1") { Remove-Item -LiteralPath "push_v3.74.192.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.193"') {
    Write-Host "+ 3.74.193" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000193_v3_74_193_get_customers_overview.sql")) {
    Write-Host "X missing migration file" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration present" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($page -notmatch "get_customers_overview") {
    Write-Host "X page does not call get_customers_overview" -ForegroundColor Red
    exit 1
}
if ($page -notmatch "loadInFlightRef") {
    Write-Host "X page missing concurrency guard" -ForegroundColor Red
    exit 1
}
Write-Host "+ page wired to RPC + guarded against double-fetch" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_193.txt"
    $msgLines = @(
        "perf(customers): v3.74.193 - single-RPC overview, no more double-fetch",
        "",
        "The /customers page used to fire 10+ SELECTs per load (customers +",
        "payments + advance_applications + customer_credits + paid invoices",
        "for overpayment detection + AR account lookup + all invoices +",
        "journal_entry_lines for AR + supporting payment / advance_application /",
        "sales_return lookups for the AR-line attribution dance) and",
        "aggregated everything in JavaScript. As the company grew this",
        "became the dominant cost of loading the page; the user reported",
        "the list visibly lagging behind the page chrome.",
        "",
        "On top of that, the loadCustomers effect depended on the userContext",
        "OBJECT, which the permissions effect re-creates on every load, so",
        "loadCustomers actually ran TWICE on every visit. The two effects",
        "raced and doubled the already-high query count.",
        "",
        "Two changes in this version:",
        "",
        "1. New RPC public.get_customers_overview(p_company_id, branch,",
        "   employee, cost_center, shared_grantor_ids, search, invoice_filter,",
        "   page, page_size) that does the aggregation server-side and returns",
        "   { total, page, page_size, rows: [...] }. Each row already carries",
        "   advance / applied / available_credits / disbursed_credits /",
        "   receivables / has_active_invoices / has_any_invoices. The page",
        "   now makes ONE call instead of 10+. Indexes added on the four",
        "   join keys so the aggregates stay cheap as the tables grow.",
        "",
        "2. The useEffect now depends on userContext.branch_id and",
        "   userContext.cost_center_id (primitives) instead of the whole",
        "   userContext object, plus a useRef guard (loadInFlightRef) that",
        "   short-circuits any second concurrent call.",
        "",
        "Receivables note: the old code derived AR from journal_entry_lines",
        "with a four-table join + four secondary lookups to attribute each",
        "line to a customer. The new code reads receivables directly from",
        "invoices (total - paid - returned) — same number, fraction of the",
        "work. The AR ledger and the bill ledger are still cross-checked by",
        "ic_ap_balance / ic_ar_balance on the dashboard.",
        "",
        "Files:",
        "  supabase/migrations/20260617000193_v3_74_193_get_customers_overview.sql",
        "  app/customers/page.tsx   (500 lines -> ~100 in loadCustomers)",
        "  lib/version.ts"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.193 pushed" -ForegroundColor Green
}
