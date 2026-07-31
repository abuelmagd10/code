$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.909 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.908.ps1") { Remove-Item -LiteralPath "push_v3.74.908.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.909"') {
    Write-Host "+ 3.74.909" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.909]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.909]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260731000001_v3_74_909_product_costs_full_row.sql"
$helper   = "lib/product-costs.ts"
$guard    = "scripts/check-product-cost-direct-read.js"
$prover   = "scripts/selftest-product-cost-direct-read.js"
$card     = "components/settings/PurchaseCostVisibilityCard.tsx"

# المواضع التى تحوّلت من قراءة الجدول إلى المسار المخوَّل.
$converted = @(
    "app/api/inventory-valuation/route.ts",
    "app/api/products/route.ts",
    "app/api/products/[id]/bundle/route.ts",
    "app/bills/[id]/edit/page.tsx",
    "app/inventory/write-offs/page.tsx",
    "app/invoices/page.tsx",
    "app/invoices/[id]/page.tsx",
    "app/purchase-orders/page.tsx",
    "app/purchase-orders/new/page.tsx",
    "app/purchase-orders/[id]/edit/page.tsx",
    "app/purchase-returns/new/page.tsx",
    "app/reports/manufacturing/bom-cost/page.tsx",
    "app/vendor-credits/new/page.tsx",
    "app/vendor-credits/[id]/edit/page.tsx",
    "components/charts/AdvancedDashboardCharts.tsx"
)

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $helper, $guard, $prover, $card, "app/settings/page.tsx") +
         $converted + @("push_v3.74.909.ps1")

# -- 1. every converted site goes through the authorised path -------------
foreach ($f in $converted) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
    $body = Get-Content -LiteralPath $f -Raw
    if ($body -notmatch [regex]::Escape("@/lib/product-costs")) {
        Write-Host "X $f no longer reads cost through the authorised path" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all 15 converted sites read cost through product_costs" -ForegroundColor Green

# -- 2. the authorised path carries ALL THREE cost columns ----------------
# Returning cost_price alone would have left the screens reading
# display_cost_price and original_cost_price straight from the table - a
# hide that covers one third and looks complete.
$m = Get-Content -LiteralPath $migration -Raw
foreach ($col in @("p.cost_price", "p.original_cost_price", "p.display_cost_price")) {
    if ($m -notmatch [regex]::Escape($col)) {
        Write-Host "X product_costs no longer returns $col - a third of the hide would leak" -ForegroundColor Red
        exit 1
    }
}
if ($m -notmatch [regex]::Escape("can_view_purchase_cost(p.company_id, NULL)")) {
    Write-Host "X product_costs stopped applying the owner's rule" -ForegroundColor Red; exit 1
}
Write-Host "+ the authorised path returns all three cost columns, under the 906 rule" -ForegroundColor Green

# -- 3. this release still hides NOTHING ----------------------------------
# The REVOKE waits for the ledger to take its cost from FIFO. Shipping it
# here would post zero-cost entries for exactly the people it hides from.
if ($m -match "REVOKE SELECT") {
    Write-Host "X 909 must not revoke: the posting paths still read cost on the user session" -ForegroundColor Red
    exit 1
}
Write-Host "+ 909 converts and measures; it does not revoke yet" -ForegroundColor Green

# -- 3b. the owner finally has a handle for his own decision --------------
$cardBody = Get-Content -LiteralPath $card -Raw
if ($cardBody -notmatch [regex]::Escape("set_purchase_cost_visibility") -or
    $cardBody -notmatch [regex]::Escape("OWNER_ONLY")) {
    Write-Host "X the settings card no longer calls the owner-only switch" -ForegroundColor Red; exit 1
}
$settings = Get-Content -LiteralPath "app/settings/page.tsx" -Raw
if ($settings -notmatch [regex]::Escape("PurchaseCostVisibilityCard")) {
    Write-Host "X the card exists but is mounted nowhere - a dead setting again" -ForegroundColor Red; exit 1
}
Write-Host "+ the three modes have a handle, and it is the owner's alone" -ForegroundColor Green

# -- 3c. the new guard is proven and enforced -----------------------------
$self = Get-Content -LiteralPath "push_v3.74.909.ps1" -Raw
foreach ($needle in @("selftest-product-cost-direct-read.js", "check-product-cost-direct-read.js")) {
    if ($self -notmatch [regex]::Escape($needle)) {
        Write-Host "X the cost-read guard is not proven and checked in this battery" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the cost-read guard is proven, then enforced" -ForegroundColor Green

# -- 4. the battery below still proves both standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.909.ps1" -Raw
if ($self2 -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery still plants both probes and watches both guards refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.908.ps1" 2>$null

# -- 5. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.908.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the product-cost-read guard refuses (and keeps the debt visible)..." -ForegroundColor Cyan
node scripts/selftest-product-cost-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the cost-read guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking product cost is read through the authorised path only..." -ForegroundColor Cyan
node scripts/check-product-cost-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X a direct product-cost read is back" -ForegroundColor Red; exit 1 }

Write-Host "Proving the products-star guard refuses (and spares the innocent)..." -ForegroundColor Cyan
node scripts/selftest-products-select-star.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the products-star guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no select(*) on products, and that the named list matches the table..." -ForegroundColor Cyan
node scripts/check-products-select-star.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a star survives on products, or the named list drifted from the table" -ForegroundColor Red; exit 1 }

Write-Host "Proving the silent-cancel guard refuses - and reproducing the defect..." -ForegroundColor Cyan
node scripts/selftest-trigger-silently-cancels-delete.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the silent-cancel guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no BEFORE DELETE trigger cancels a delete in silence..." -ForegroundColor Cyan
node scripts/check-trigger-silently-cancels-delete.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a trigger can swallow a delete" -ForegroundColor Red; exit 1 }

Write-Host "Proving the impossible-rollback guard refuses (and stays silent)..." -ForegroundColor Cyan
node scripts/selftest-impossible-rollback.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the impossible-rollback guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Counting compensating deletes a trigger can refuse (must stay ZERO)..." -ForegroundColor Cyan
# NO `| Select-Object -First N` here (883 lesson: -First kills the pipe, node
# gets EPIPE, and a PASSING guard is declared a failure). -Last N drains.
node scripts/check-impossible-rollback.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a compensating delete a trigger can refuse still exists" -ForegroundColor Red; exit 1 }

Write-Host "Proving the sub_type divergence guard refuses..." -ForegroundColor Cyan
node scripts/selftest-subtype-tenant-divergence.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the divergence guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no sub_type exists in some companies but not others..." -ForegroundColor Cyan
node scripts/check-subtype-tenant-divergence.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a sub_type the code searches for is present in only some companies" -ForegroundColor Red; exit 1 }

Write-Host "Proving the ledger-landmine guard refuses..." -ForegroundColor Cyan
node scripts/selftest-ledger-landmines.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the landmine guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking for ledger landmines..." -ForegroundColor Cyan
node scripts/check-ledger-landmines.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X a new ledger landmine appeared" -ForegroundColor Red; exit 1 }

Write-Host "Proving the snapshot/database guard refuses..." -ForegroundColor Cyan
node scripts/selftest-schema-snapshot-matches-db.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the snapshot matches the live database..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot disagrees with the database" -ForegroundColor Red; exit 1 }

Write-Host "Checking the snapshot does not resurrect a dropped function..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot still describes something a migration removed" -ForegroundColor Red; exit 1 }

Write-Host "Proving the phantom-column guard refuses insert AND upsert..." -ForegroundColor Cyan
node scripts/selftest-phantom-columns.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the phantom-column guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes (update + insert + upsert)..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js --require-db | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking purchase movement cost matches the ledger..." -ForegroundColor Cyan
node scripts/check-movement-cost-matches-ledger.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a movement disagrees with the ledger" -ForegroundColor Red; exit 1 }

Write-Host "Checking custody movements are costed and linked..." -ForegroundColor Cyan
node scripts/check-custody-movements-costed-and-linked.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a custody movement is uncosted or unlinked" -ForegroundColor Red; exit 1 }

Write-Host "Checking ledger integrity..." -ForegroundColor Cyan
node scripts/check-ledger-integrity.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X ledger integrity is broken" -ForegroundColor Red; exit 1 }

Write-Host "Counting writes whose result is never checked..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X unchecked-writes baseline moved the wrong way" -ForegroundColor Red; exit 1 }

Write-Host "Proving the audit-trail guard refuses..." -ForegroundColor Cyan
node scripts/selftest-audit-trail-records.js
if ($LASTEXITCODE -ne 0) { Write-Host "X audit guard not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking every audited table actually records..." -ForegroundColor Cyan
node scripts/check-audit-trail-actually-records.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X an audited table records nothing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no route writes the request body straight through..." -ForegroundColor Cyan
node scripts/check-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) { Write-Host "X raw-body writes remain" -ForegroundColor Red; exit 1 }

Write-Host "Proving the raw-body guard refuses..." -ForegroundColor Cyan
node scripts/selftest-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) { Write-Host "X raw-body guard not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Proving the anon-open guard refuses BOTH shapes, then checking (v3.74.892)..." -ForegroundColor Cyan
node scripts/check-anon-open-tables.js --prove --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X tables are open to anon" -ForegroundColor Red; exit 1 }

Write-Host "Proving the je-default guard refuses a planted omitting function, then checking (v3.74.893)..." -ForegroundColor Cyan
node scripts/check-je-default-status.js --prove --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a new function relies on the journal_entries.status default" -ForegroundColor Red; exit 1 }

Write-Host "Checking nobody is stranded without a company..." -ForegroundColor Cyan
node scripts/check-users-without-company.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X stranded-user check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the governance audit..." -ForegroundColor Cyan
node scripts/ai-governance-audit.js --ci
if ($LASTEXITCODE -ne 0) { Write-Host "X governance audit failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking finished-goods conversion cost..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking inventory movement coverage..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking no company-reading function is open to anonymous callers..." -ForegroundColor Cyan
node scripts/check-anon-reachable-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the security finding is not cleared" -ForegroundColor Red; exit 1 }

Write-Host "Verifying migrations against the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.908.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_909.txt"
    $msgLines = @(
        'feat(security): v3.74.909 - product cost is read through the authorised path, and the owner finally holds the switch',
        '',
        'The read path for the 906 decision, the handle for it, and the',
        'measurement that decides when the hide can land. Still hides',
        'NOTHING - and the reason is in the ledger, not in caution.',
        '',
        'product_costs(ids) now returns ALL THREE cost columns. It returned',
        'cost_price alone, but the screens display display_cost_price when',
        'the display currency matches and edit through original_cost_price,',
        'so a one-column path would have left two thirds readable straight',
        'from the table - a hide that looks complete and is not.',
        '',
        'lib/product-costs.ts attaches the cost onto the rows the screens',
        'already hold, instead of returning a separate map: dozens of',
        'readers keep reading product.cost_price, and only the SOURCE of the',
        'number changes. Whoever is not entitled gets an explicit null - not',
        'an absent field, because an absent field renders as zero, and a',
        'lying zero is worse than an honest blank.',
        '',
        'Fifteen display sites converted: products list API, valuation,',
        'bundles, bill edit, write-offs, invoices (list and detail),',
        'purchase orders (list, new, edit), purchase returns (both paths),',
        'BOM cost report, vendor credits (new, edit) and the dashboard',
        'chart. Every nested products(...) join that carried cost was',
        'converted too - that shape reads as innocent and is not.',
        '',
        'The owner-only switch has a face at last: a card in company',
        'settings offering the three modes and calling',
        'set_purchase_cost_visibility. A non-owner reads the standing rule',
        'and cannot change it; the server refuses with OWNER_ONLY anyway.',
        'A setting nobody can change is a dead setting.',
        '',
        'WHY THE REVOKE IS NOT IN THIS RELEASE. Measured, not assumed: four',
        'places read cost to COMPUTE, not to display, and all of them run on',
        'the user session. accounting-transaction-service uses it as the',
        'COGS fallback when FIFO layers fall short;',
        'third-party-inventory.ts:140 falls back to unit_price * 0.7, an',
        'invented cost; and currency-conversion-system rewrites display',
        'prices from it. Revoke today and a salesperson - exactly the person',
        'the hide targets - posts COGS of zero, silently, into the books.',
        'The owner decided the fix: the ledger takes its cost from the FIFO',
        'layers inside the database, so posting stops depending on a display',
        'column at all. That is the next release, and the REVOKE follows it.',
        '',
        'check-product-cost-direct-read.js refuses any new direct read -',
        'including inside a nested join - and names those four as measured',
        'debt without failing the push. Proven refusing both shapes, sparing',
        'clean selects and a unit_price lookalike, and keeping the debt',
        'visible.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.909 pushed - the authorised path is live and the switch is in the owner's hand; the ledger comes off the display column next" -ForegroundColor Green
}
