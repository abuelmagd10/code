$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.905 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.904.ps1") { Remove-Item -LiteralPath "push_v3.74.904.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.905"') {
    Write-Host "+ 3.74.905" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.905]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.905]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$poList  = "app/purchase-orders/page.tsx"
$poApi   = "app/api/v2/purchase-orders/route.ts"
$valid   = "lib/validation.ts"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $poList, $poApi, $valid, "push_v3.74.905.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the API sends every field the list actually reads ------------------
$apiRaw = Get-Content -LiteralPath $poApi -Raw
$sel = [regex]::Match($apiRaw, 'const PO_SELECT = `([^`]*)`')
if (-not $sel.Success) {
    Write-Host "X could not find the PO_SELECT template - the shipping check cannot run" -ForegroundColor Red; exit 1
}
$selBody = $sel.Groups[1].Value
foreach ($col in @("shipping", "shipping_provider_id", "total_amount")) {
    if ($selBody -notmatch [regex]::Escape($col)) {
        Write-Host "X PO_SELECT no longer sends $col - the list column would read blank" -ForegroundColor Red; exit 1
    }
}
# A SQL comment inside a PostgREST select is parsed as a COLUMN NAME and the
# whole request 400s. This bit once, while adding the shipping fields.
if ($selBody -match "--") {
    Write-Host "X a SQL comment is inside the PostgREST select - it is read as a column" -ForegroundColor Red; exit 1
}
Write-Host "+ the purchase-order API sends the shipping fields, and its select carries no comment" -ForegroundColor Green

# -- 2. the cache hit still loads what the cache does not hold -------------
$lst = Get-Content -LiteralPath $poList -Raw
if ($lst -notmatch [regex]::Escape("loadPageDependencies(cached.orders)")) {
    Write-Host "X a cache hit no longer loads items/bills - the products column goes blank again" -ForegroundColor Red; exit 1
}
if ($lst -notmatch [regex]::Escape("loadPageDependencies(newOrders)")) {
    Write-Host "X the fresh fetch path no longer loads its dependencies" -ForegroundColor Red; exit 1
}
Write-Host "+ both fetch paths load the page dependencies the cache does not hold" -ForegroundColor Green

# -- 3. a withheld price reads as withheld, and its total is not leaked ----
if ($lst -match [regex]::Escape("if (!canViewPrices) return '-'")) {
    Write-Host "X a withheld price is shown as '-' again - indistinguishable from missing data" -ForegroundColor Red; exit 1
}
if ($lst -notmatch [regex]::Escape("if (!canViewPrices) return '***'")) {
    Write-Host "X the withheld-price marker is gone from the total column" -ForegroundColor Red; exit 1
}
if ($lst -notmatch [regex]::Escape("canViewPrices")) {
    Write-Host "X the footer no longer knows who may see prices" -ForegroundColor Red; exit 1
}
$footer = [regex]::Match($lst, "Total Value:[\s\S]{0,600}")
if ($footer.Success -and ($footer.Value -notmatch [regex]::Escape("canViewPrices"))) {
    Write-Host "X the footer prints the grand total to someone whose lines are hidden" -ForegroundColor Red; exit 1
}
Write-Host "+ withheld prices read as withheld, and the footer does not leak their sum" -ForegroundColor Green

# -- 4. the purchasing officer is a known role, not a silent staff ---------
$vd = Get-Content -LiteralPath $valid -Raw
if ($vd -notmatch [regex]::Escape("purchasing_officer: {")) {
    Write-Host "X purchasing_officer fell out of the purchase-order permission map" -ForegroundColor Red; exit 1
}
$po = [regex]::Match($vd, "purchasing_officer: \{[^}]*\}")
if (-not $po.Success -or ($po.Value -notmatch [regex]::Escape("canViewPrice: true"))) {
    Write-Host "X the owner decision (purchasing officer sees purchase prices) was reverted" -ForegroundColor Red; exit 1
}
if ($vd -notmatch [regex]::Escape("PURCHASE_ORDER_ROLE_PERMISSIONS.staff")) {
    Write-Host "X the most-restrictive fallback for an unknown role is gone" -ForegroundColor Red; exit 1
}
Write-Host "+ purchasing officer is named in the permission map; unknown roles still fall to the strictest" -ForegroundColor Green

# -- 5. the battery below still proves both standing guards ----------------
$self = Get-Content -LiteralPath "push_v3.74.905.ps1" -Raw
if ($self -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery still plants both probes and watches both guards refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.904.ps1" 2>$null

# -- 6. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.904.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

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
git add -u -- "push_v3.74.904.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_905.txt"
    $msgLines = @(
        'fix(purchase-orders): v3.74.905 - three blank columns in the list, three unrelated causes',
        '',
        'The owner reported "the data is missing" on the purchase-order',
        'list: Products, Total and Shipping all showed "-" while the footer',
        'printed Total Value 359.10 - which is exactly the sum of the six',
        'orders in the database. So nothing was lost on write; three',
        'independent display defects were measured:',
        '',
        '1. SHIPPING read a field the API never sent. The column reads',
        '   shipping_provider_id and /api/v2/purchase-orders selected',
        '   neither it nor the shipping cost, so the cell was blank even',
        '   for orders that HAVE a provider (PO-0005, PO-0007) or a cost',
        '   (5, 1, 2 on PO-0002..4). The fields are now selected; the cell',
        '   shows the provider, else the cost, else an honest dash.',
        '',
        '2. PRODUCTS went blank on a cache hit. fetchOrders returned early',
        '   from the page cache, which holds only {orders, totalCount},',
        '   without loading items, linked bills or returned quantities -',
        '   so orderItems stayed empty and every products cell rendered',
        '   "-", taking the paid/returned detail down with it. The loader',
        '   is extracted as loadPageDependencies and called on BOTH paths.',
        '',
        '3. TOTAL was withheld from the purchasing officer, because',
        '   PURCHASE_ORDER_ROLE_PERMISSIONS never listed the role and any',
        '   unlisted role silently falls back to staff (canViewPrice',
        '   false). The role whose whole job is purchasing could not see a',
        '   purchase price. OWNER DECISION: the purchasing officer sees',
        '   prices - now listed explicitly (create/edit/send/receive/view',
        '   price/view all). Store manager and manufacturing officer stay',
        '   without prices, and an unknown role still falls to the',
        '   strictest entry, which is deliberate.',
        '',
        'Two more things fixed on the way. The protection was theatre: the',
        'line prices were hidden and then the grand total was printed to',
        'the same user - whoever is denied the parts is denied the sum, so',
        'the footer now shows *** for them. And withheld now reads as',
        'withheld: *** instead of "-", the same language the detail page',
        'already used, because "-" reads as missing data, not as denied.',
        'Finally the column memo did not depend on canViewPrices or',
        'shippingProviders, both loaded after first paint, so the columns',
        'could be computed once from stale state; both are now declared.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.905 pushed - an empty cell is a claim about the data; three of them were lying differently" -ForegroundColor Green
}
