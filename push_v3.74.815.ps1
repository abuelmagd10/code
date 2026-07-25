$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.814.ps1") { Remove-Item -LiteralPath "push_v3.74.814.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.815"') {
    Write-Host "+ 3.74.815" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.815]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.815]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- (a) valuation checker compares against FIFO, not the static cost field ----
$m1 = Get-Content -LiteralPath "supabase/migrations/20260725000001_v3_74_815_valuation_checker_compares_fifo.sql" -Raw
foreach ($must in @("fifo_cost_lots", "remaining_quantity * l.unit_cost")) {
    if ($m1 -notmatch [regex]::Escape($must)) {
        Write-Host "X valuation checker still measures against the wrong number: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the drift checker measures the same lots the system values" -ForegroundColor Green

# --- (b) contra-equity + shareholder wiring -----------------------------------
$m2 = Get-Content -LiteralPath "supabase/migrations/20260725000002_v3_74_815_contra_equity_and_shareholder_links.sql" -Raw
foreach ($must in @("'drawings'", "provision_shareholder_accounts", "sync_shareholder_percentages")) {
    if ($m2 -notmatch [regex]::Escape($must)) {
        Write-Host "X shareholder migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ every new partner gets his accounts and his true percentage" -ForegroundColor Green

# --- (c) manufacturing approval notifications ---------------------------------
$m3 = Get-Content -LiteralPath "supabase/migrations/20260725000003_v3_74_815_manufacturing_approval_notifications.sql" -Raw
foreach ($must in @("bom_version_notify_approval", "manufacturing_notify_decision_trg",
                    "routing_version_notify_decision", "production_order_notify_decision")) {
    if ($m3 -notmatch [regex]::Escape($must)) {
        Write-Host "X manufacturing notification migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all four manufacturing gates ring, and every decision travels back" -ForegroundColor Green

# --- (d) equity report excludes archived entries ------------------------------
$eq = Get-Content -LiteralPath "lib/equity-reporting-service.ts" -Raw
if ($eq -notmatch [regex]::Escape("is_deleted.is.null,is_deleted.eq.false")) {
    Write-Host "X equity report still counts archived journal entries" -ForegroundColor Red; exit 1
}
Write-Host "+ retained earnings now agree with the balance sheet" -ForegroundColor Green

# --- (e) simple summary shows ALL revenue, not just goods ---------------------
$sr = Get-Content -LiteralPath "app/api/simple-report/route.ts" -Raw
if ($sr -notmatch [regex]::Escape('coa?.account_type === "income"')) {
    Write-Host "X simple summary still drops service revenue" -ForegroundColor Red; exit 1
}
Write-Host "+ services count as revenue in the simple summary" -ForegroundColor Green

# --- (f) invoice revenue splits by each item's income account -----------------
$ae = Get-Content -LiteralPath "lib/accrual-accounting-engine.ts" -Raw
foreach ($must in @("products(income_account_id)", "groupsTotal")) {
    if ($ae -notmatch [regex]::Escape($must)) {
        Write-Host "X the TS builder still lumps all revenue into one account: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both revenue posters classify a service the same way" -ForegroundColor Green

# --- (g) warehouse report: manufacturing flow + a working export --------------
$wi = Get-Content -LiteralPath "app/reports/warehouse-inventory/page.tsx" -Raw
foreach ($must in @("productionInQty", "productionOutQty", "const exportCsv")) {
    if ($wi -notmatch [regex]::Escape($must)) {
        Write-Host "X warehouse report missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ finished goods no longer appear out of nowhere, and export works" -ForegroundColor Green

# --- (h) raw materials are not sellable --------------------------------------
$pp = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pp -notmatch [regex]::Escape("formData.product_type !== 'raw_material'")) {
    Write-Host "X the sale-price field still demands a price for raw materials" -ForegroundColor Red; exit 1
}
foreach ($f in @("app/invoices/new/page.tsx",
                 "app/invoices/[id]/edit/page.tsx",
                 "app/sales-orders/new/page.tsx",
                 "app/sales-orders/[id]/edit/page.tsx",
                 "components/bookings/BookingAddons.tsx")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch [regex]::Escape("product_type.is.null,product_type.neq.raw_material")) {
        Write-Host "X raw materials can still be sold from: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ raw materials are consumed in production, never sold" -ForegroundColor Green

# --- (i) notification catch-up after every successful subscribe --------------
$rm = Get-Content -LiteralPath "lib/realtime-manager.ts" -Raw
if ($rm -notmatch [regex]::Escape("realtime_resubscribed")) {
    Write-Host "X the manager still loses events across reconnects" -ForegroundColor Red; exit 1
}
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch [regex]::Escape("انقطع اتصال قناة الإشعارات")) {
    Write-Host "X the bell still screams red at a transient reconnect" -ForegroundColor Red; exit 1
}
$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
if ($nc -notmatch [regex]::Escape("realtime_resubscribed")) {
    Write-Host "X an open notification box still shows a stale list after reconnect" -ForegroundColor Red; exit 1
}
Write-Host "+ nothing born during a dropped channel stays invisible" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "lib/equity-reporting-service.ts",
    "app/api/simple-report/route.ts",
    "app/reports/simple-summary/page.tsx",
    "lib/accrual-accounting-engine.ts",
    "app/reports/warehouse-inventory/page.tsx",
    "app/products/page.tsx",
    "app/invoices/new/page.tsx",
    "app/invoices/[id]/edit/page.tsx",
    "app/sales-orders/new/page.tsx",
    "app/sales-orders/[id]/edit/page.tsx",
    "components/bookings/BookingAddons.tsx",
    "components/sidebar.tsx",
    "components/NotificationCenter.tsx",
    "lib/realtime-manager.ts",
    "supabase/migrations/20260725000001_v3_74_815_valuation_checker_compares_fifo.sql",
    "supabase/migrations/20260725000002_v3_74_815_contra_equity_and_shareholder_links.sql",
    "supabase/migrations/20260725000003_v3_74_815_manufacturing_approval_notifications.sql",
    "push_v3.74.815.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.814.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_815.txt"
    $msgLines = @(
        'fix(reports,accounting,manufacturing): v3.74.815 - the review pass',
        'seven system gaps, no company data touched',
        '',
        'Owner rule for this session: we do not repair one company''s rows,',
        'we repair the system so the gap cannot recur anywhere.',
        '',
        '(a) 20260725000001: the inventory-drift checker compared the GL to',
        '    products.cost_price instead of the FIFO lots the system actually',
        '    values stock with - it cried a 116.63 drift that did not exist.',
        '(b) 20260725000002: fn_validate_normal_balance rejected contra-equity',
        '    (drawings/treasury stock), so a partner drawings account could',
        '    not exist. Plus provision_shareholder_accounts (every new partner',
        '    gets his capital + drawings accounts wired) and',
        '    sync_shareholder_percentages (ownership follows paid-in capital',
        '    instead of a hand-typed number that dividends then trusted).',
        '(c) 20260725000003: BOM versions had NO approval notification trigger',
        '    at all, and none of the four manufacturing gates told the',
        '    requester the decision. One shared decision trigger reads the',
        '    status column name from TG_ARGV via to_jsonb, so it serves both',
        '    status (BOM) and approval_status (routing/order). Rehearsed on',
        '    the test DB: request=1 to the owner, decision=1 to the requester.',
        '(d) The equity statement was the only report counting archived',
        '    journal entries, so retained earnings disagreed with the',
        '    balance sheet.',
        '(e) The simple summary captured the sales account only and dropped',
        '    service revenue entirely: it showed 1,049 against a true 2,434.03.',
        '(f) Two invoice revenue posters classified the same service two',
        '    different ways (4100 vs 4200) because the TS builder ignored',
        '    products.income_account_id. It now splits proportionally, with',
        '    the largest bucket absorbing rounding so the lines equal the net.',
        '(g) Warehouse report: production_receipt/production_issue are now',
        '    their own columns (finished goods used to appear from nowhere),',
        '    and the export button - displayed but wired to nothing - works.',
        '(h) Raw materials were sellable: item_type is ''product'' for every',
        '    stocked item, the real distinction lives in product_type. They',
        '    are excluded from invoices, sales orders and booking add-ons,',
        '    and the mandatory sale-price field is hidden and zeroed.',
        '(i) Realtime: every successful subscribe now fires a catch-up (an',
        '    event born at 17:18:32 was lost because the subscription came',
        '    back at 17:18:36), and a transient CHANNEL_ERROR is a calm',
        '    Arabic warning instead of a red error.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.815 pushed - seven gaps closed at the system level, no company row touched" -ForegroundColor Green
}
