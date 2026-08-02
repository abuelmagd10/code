$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.938 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.937.ps1") { Remove-Item -LiteralPath "push_v3.74.937.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.938"') {
    Write-Host "+ 3.74.938" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.938]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.938]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
# No migration: stage 2, third batch - the three purchase-order screens AND
# the two API routes their rows actually come from.
$list    = "app/purchase-orders/page.tsx"
$detail  = "app/purchase-orders/[id]/page.tsx"
$edit    = "app/purchase-orders/[id]/edit/page.tsx"
$apiPo   = "app/api/v2/purchase-orders/route.ts"
$apiBill = "app/api/v2/bills/route.ts"
$lib     = "lib/purchase-money.ts"
$guard   = "scripts/check-purchase-money-direct-read.js"
$trap    = "scripts/selftest-purchase-money-direct-read.js"
$dbGuard = "scripts/check-purchase-cost-masked-path.js"
$dbTrap  = "scripts/selftest-purchase-cost-masked-path.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md", "tsconfig.json",
           $list, $detail, $edit, $apiPo, $apiBill, $lib,
           $guard, $trap, $dbGuard, $dbTrap,
           "scripts/check-product-management-one-door.js",
           "push_v3.74.938.ps1")

$l  = Get-Content -LiteralPath $list -Raw
$d  = Get-Content -LiteralPath $detail -Raw
$e  = Get-Content -LiteralPath $edit -Raw
$ap = Get-Content -LiteralPath $apiPo -Raw
$ab = Get-Content -LiteralPath $apiBill -Raw
$lm = Get-Content -LiteralPath $lib -Raw
$g  = Get-Content -LiteralPath $guard -Raw
$t  = Get-Content -LiteralPath $trap -Raw
$dg = Get-Content -LiteralPath $dbGuard -Raw
$dt = Get-Content -LiteralPath $dbTrap -Raw

# -- 1. the rows come from the API, so the API reads the masked view -----
# THIS IS THE HOLE 936 SHIPPED: app/bills/page.tsx was converted while the
# route that actually feeds it kept reading the raw table. Masking a file
# nobody calls hides nothing.
if ($ab -notmatch [regex]::Escape(".from('bills_masked')")) {
    Write-Host "X /api/v2/bills still reads the raw bills table - the 936 hole is open" -ForegroundColor Red
    exit 1
}
if ($ap -notmatch [regex]::Escape(".from('purchase_orders_masked')")) {
    Write-Host "X /api/v2/purchase-orders still reads the raw table" -ForegroundColor Red; exit 1
}
Write-Host "+ both v2 routes serve their rows from the masked views" -ForegroundColor Green

# -- 2. and the guard now follows a screen to its /api source -------------
if ($g -notmatch [regex]::Escape("apiPathsIn")) {
    Write-Host "X the guard does not follow a converted screen to its /api source" -ForegroundColor Red
    exit 1
}
if ($g -notmatch [regex]::Escape("no app/api/**/route.ts matches it")) {
    Write-Host "X an unresolvable /api path would pass unproven" -ForegroundColor Red; exit 1
}
if ($t -notmatch [regex]::Escape("a converted screen whose /api source reads the raw table")) {
    Write-Host "X the trap does not prove the /api-source rule refuses" -ForegroundColor Red; exit 1
}
if ($t -notmatch [regex]::Escape("an /api route with no GET")) {
    Write-Host "X the trap does not prove server-side work is spared" -ForegroundColor Red; exit 1
}
Write-Host "+ the /api source of a converted screen is held to the same rule, and proven both ways" -ForegroundColor Green

# -- 3. one home for the rule: no local role list on a converted screen ---
# 934 removed isUpperRole from the products screen. The same shape lived on
# here as canViewPurchasePrices - a second copy that drifts on first edit.
if ($g -notmatch [regex]::Escape("LOCAL_ROLE_RULES")) {
    Write-Host "X the guard does not refuse a local role list" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("strip(raw, { strings: true })")) {
    Write-Host "X the local-role search would read comments as code" -ForegroundColor Red; exit 1
}
if ($t -notmatch [regex]::Escape("only in a comment or a string")) {
    Write-Host "X the trap does not prove a comment is spared" -ForegroundColor Red; exit 1
}
Write-Host "+ a converted screen may not decide cost visibility from a local role list" -ForegroundColor Green

# -- 4. hidden is told from empty by a NOT NULL witness, and it is guarded -
# A null in a masked column means two things. shipping defaults to zero and
# accepts null, so measuring the hide on it would show a dash to EVERYONE on
# an order with no shipping. The witness must be a column that cannot be null.
if ($lm -notmatch [regex]::Escape("export function rowMoneyHidden")) {
    Write-Host "X there is no single home for 'is this row hidden'" -ForegroundColor Red; exit 1
}
if ($dg -notmatch [regex]::Escape("attnotnull")) {
    Write-Host "X the database guard does not check the witness column is NOT NULL" -ForegroundColor Red; exit 1
}
if ($dt -notmatch [regex]::Escape("the hidden-money witness column turned nullable")) {
    Write-Host "X the trap does not plant a nullable witness" -ForegroundColor Red; exit 1
}
if ($dt -notmatch [regex]::Escape("SET NOT NULL")) {
    Write-Host "X the trap would leave the table looser than it found it" -ForegroundColor Red; exit 1
}
Write-Host "+ 'hidden' cannot be confused with 'empty', and the constraint itself is watched" -ForegroundColor Green

# -- 5. the edit screen is blocked, at load AND at save -------------------
# Editing a PO rebuilds its totals from unit_price and copies them into the
# linked bill. A blocked reader carrying on would write zeros into TWO real
# documents.
if ($e -notmatch [regex]::Escape('if (costGate !== "allowed")')) {
    Write-Host "X the edit screen would open for someone who cannot read the prices" -ForegroundColor Red
    exit 1
}
if (([regex]::Matches($e, [regex]::Escape('costGate !== "allowed"'))).Count -lt 2) {
    Write-Host "X the gate is not repeated at save - a stale tab would still write" -ForegroundColor Red
    exit 1
}
if ($e -notmatch [regex]::Escape("fetchCanViewPurchaseCost")) {
    Write-Host "X the edit screen never asks the rule" -ForegroundColor Red; exit 1
}
if ($e -notmatch [regex]::Escape("branch_id ?? null")) {
    Write-Host "X it asks without this order's branch - 914 would be undone" -ForegroundColor Red; exit 1
}
Write-Host "+ the edit screen refuses at load and again at save, scoped to this order's branch" -ForegroundColor Green

# -- 6. no lying zero, and no total summed over a hidden part -------------
if ($l -match [regex]::Escape("if (!canViewPrices) return '***'")) {
    Write-Host "X the list still masks by role instead of by data" -ForegroundColor Red; exit 1
}
foreach ($pair in @(@($list, $l), @($detail, $d))) {
    if ($pair[1] -notmatch [regex]::Escape("sumOrHidden")) {
        Write-Host "X $($pair[0]) sums money without refusing a hidden part" -ForegroundColor Red; exit 1
    }
    if ($pair[1] -notmatch [regex]::Escape("HIDDEN_MONEY")) {
        Write-Host "X $($pair[0]) has no symbol for a hidden amount" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ hidden amounts read as a dash, and one hidden part hides the whole total" -ForegroundColor Green

# -- 7. and the ratchet grew, in the same release ------------------------
foreach ($f in @($list, $detail, $edit, $apiPo, $apiBill)) {
    if ($g -notmatch [regex]::Escape("`"$f`"")) {
        Write-Host "X $f was converted but not added to the guard - nobody watches it" -ForegroundColor Red
        exit 1
    }
}
if ($t -notmatch [regex]::Escape("a comment that merely mentions the table")) {
    Write-Host "X the trap no longer pins the comment false-positive" -ForegroundColor Red; exit 1
}
Write-Host "+ all five converted files joined the ratchet in the same release" -ForegroundColor Green

# -- 7b. the scratch folders are OUT of the type-check graph -------------
#
# The staging folder _wip_NNN holds working COPIES of real screens. tsconfig
# included **/*.ts and **/*.tsx from the repo root, so ten scratch files -
# among them a second copy of app/bills/page.tsx - were being compiled as
# part of the project. They passed by luck, not by design: an old copy that
# still imports a removed export, or a probe file, fails the release for a
# reason that has nothing to do with the release. Measured: 1181 files
# before, 1171 after, 10 of them scratch.
$ts = Get-Content -LiteralPath "tsconfig.json" -Raw
if ($ts -notmatch [regex]::Escape('"_wip_*"')) {
    Write-Host "X tsconfig no longer excludes _wip_* - scratch copies would be type-checked" -ForegroundColor Red
    exit 1
}
Write-Host "+ scratch folders are outside the type-check graph" -ForegroundColor Green

# -- 8. a dropped connection is not a measurement ------------------------
# Three runs died on a transient drop in one day, and one KILLED the process
# with a raw stack instead of reporting - a guard that falls over at random
# gets worked around within a week.
foreach ($dbg in @("scripts/check-purchase-cost-masked-path.js",
                   "scripts/check-product-management-one-door.js")) {
    $gsrc = Get-Content -LiteralPath $dbg -Raw
    if ($gsrc -notmatch [regex]::Escape("client.on(")) {
        Write-Host "X $dbg has no error listener - a dropped socket would kill it" -ForegroundColor Red
        exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("TRANSIENT")) {
        Write-Host "X $dbg does not retry a transient drop" -ForegroundColor Red; exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("problems.length = 0")) {
        Write-Host "X $dbg would carry half a measurement into its retry" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the database guards survive a dropped connection, and retry from a clean slate" -ForegroundColor Green

# -- 9. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.938.ps1" -Raw
foreach ($needle in @("check-je-default-status.js --prove --require-db",
                      "check-anon-open-tables.js --prove --require-db",
                      "selftest-products-branch-policy.js",
                      "selftest-branch-isolation-holes.js",
                      "selftest-transfer-journal.js",
                      "selftest-purchase-cost-masked-path.js",
                      "selftest-cost-rule-has-one-home.js",
                      "selftest-product-management-one-door.js",
                      "selftest-purchase-money-direct-read.js")) {
    if ($self2 -notmatch [regex]::Escape($needle)) {
        Write-Host "X the push battery no longer proves: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.937.ps1" 2>$null

# -- 10. nothing staged beyond this release (the 872 lesson) -------------
$expected = @($files) + @("push_v3.74.937.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the direct-read guard refuses on all thirteen shapes, and spares the innocent..." -ForegroundColor Cyan
node scripts/selftest-purchase-money-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the direct-read guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking converted screens - and their /api sources - read money through the masked path only..." -ForegroundColor Cyan
node scripts/check-purchase-money-direct-read.js --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a converted screen or its /api source reads a table directly" -ForegroundColor Red; exit 1 }

Write-Host "Proving the products-door guard refuses all three shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-product-management-one-door.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the products-door guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring who may create a product, by actually trying it as every member..." -ForegroundColor Cyan
node scripts/check-product-management-one-door.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X who may create a product is not what the code assumes" -ForegroundColor Red; exit 1 }

Write-Host "Proving the one-home guard refuses a second copy of the cost rule..." -ForegroundColor Cyan
node scripts/selftest-cost-rule-has-one-home.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the one-home guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the cost rule has exactly one home..." -ForegroundColor Cyan
node scripts/check-cost-rule-has-one-home.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the cost rule has more than one home" -ForegroundColor Red; exit 1 }

Write-Host "Proving the masked path refuses all seven shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-purchase-cost-masked-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the masked-path guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring the purchase-cost masked path by impersonation on the live database..." -ForegroundColor Cyan
node scripts/check-purchase-cost-masked-path.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the masked path is not what the code assumes" -ForegroundColor Red; exit 1 }

Write-Host "Proving an exposed SECURITY DEFINER writer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-exposed-definer-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the definer-exposure guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Auditing SECURITY DEFINER writers on the live database..." -ForegroundColor Cyan
node scripts/check-exposed-definer-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a full-rights writer is reachable by end users" -ForegroundColor Red; exit 1 }

Write-Host "Proving an unposted cross-branch transfer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-transfer-journal.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the transfer-journal mechanism was not proven" -ForegroundColor Red; exit 1 }

Write-Host "Proving the branch-isolation guard catches the real leak - on TWELVE shapes (TEST only)..." -ForegroundColor Cyan
node scripts/selftest-branch-isolation-holes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch-isolation guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring branch isolation by impersonation on the live database..." -ForegroundColor Cyan
node scripts/check-branch-isolation-holes.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a branch member reads another branch's documents" -ForegroundColor Red; exit 1 }

Write-Host "Proving the branch-rules guard refuses all five reversions (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-products-branch-policy.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch-visibility guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking product visibility by branch is in force on the live database..." -ForegroundColor Cyan
node scripts/check-products-branch-policy.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch rule is not in force on the database" -ForegroundColor Red; exit 1 }

Write-Host "Proving the cost-grant guard refuses a re-grant (on the TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-product-cost-grant.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the grant guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the purchase cost is actually revoked on the live database..." -ForegroundColor Cyan
node scripts/check-product-cost-grant.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the hide is not in force on the database" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.937.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_to_delete") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_wip_") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_938.txt"
    $msgLines = @(
        'feat(security): v3.74.938 - the purchase orders, and the API hole 936 shipped',
        '',
        'STAGE 2, THIRD BATCH: the three purchase-order screens. But the most',
        'important finding in this batch is NOT a screen.',
        '',
        'A CONVERTED SCREEN WAS TAKING ITS MONEY FROM SOMEWHERE ELSE.',
        '',
        'The purchase-order list does not query the table itself; it calls',
        '/api/v2/purchase-orders. Opening that route showed the bill list is the',
        'same shape: converted in 936 to read bills_masked, while its rows come',
        'from app/api/v2/bills/route.ts, which read the raw table. THE MASKING WAS',
        'IN A FILE NOBODY CALLS, and the amounts crossed the wire in full.',
        '',
        'Both routes now read the masked views. Both run with the USER session',
        '(anon key, not the service key), so the security_invoker view applies to',
        'them exactly as it does in the browser.',
        '',
        'AND THE CLASS WAS CLOSED, not just the instance: the guard now follows',
        'every /api/... a converted screen calls, and any route that exposes a GET',
        'is held to the same rule. An /api path that resolves to no route file is',
        'refused too - what cannot be resolved cannot be proven clean.',
        '',
        'A SECOND HOME FOR THE RULE WAS REMOVED. All three screens decided price',
        'visibility with canViewPurchasePrices - a local role table in',
        'lib/validation.ts, the same shape deleted from the products screen in 934.',
        'Two copies of one rule diverge on the first edit, and the difference shows',
        'up as exposed money. What is displayed is now decided by the data itself:',
        'a hidden amount arrives as null and reads as a dash with a tooltip.',
        '',
        'HIDDEN AND EMPTY NO LONGER LOOK ALIKE. A null in a masked column means two',
        'things, and shipping defaults to zero and accepts null - measuring the hide',
        'on it would show a dash to EVERYONE on an order with no shipping. The hide',
        'is measured on a NOT NULL witness (total_amount on heads, unit_price on',
        'lines); all three were measured to be NOT NULL, and THE CONSTRAINT ITSELF',
        'IS NOW GUARDED - the database guard refuses if a witness turns nullable,',
        'and the trap plants exactly that on the test database and watches it refuse.',
        '',
        'THE EDIT SCREEN IS BLOCKED OUTRIGHT. Editing a purchase order rebuilds its',
        'totals from the unit prices it read and copies them into the linked bill,',
        'so a blocked reader carrying on would write zeros over real figures in TWO',
        'documents. There is a gate at load and another at save, and the condition',
        'is "not allowed" rather than "blocked" - if the check never answers, the',
        'screen stays shut (865).',
        '',
        'NO LYING ZERO IN ANY TOTAL: the list totals and the detail cards go through',
        'sumOrHidden - ONE HIDDEN PART HIDES THE WHOLE SUM - and the line discount',
        'built from unit prices does the same. "Does it have returns?" is now asked',
        'of return_status, which is not money and is never masked.',
        '',
        'Five files joined the ratchet in the same release. 120 direct reads remain',
        'in screens not yet converted, printed on every run.',
        '',
        'ALSO: tsconfig now excludes the _wip_* staging folders. They hold working',
        'COPIES of real screens, and the project include (**/*.ts, **/*.tsx from the',
        'repo root) was compiling ten of them - including a second copy of',
        'app/bills/page.tsx. They passed by luck. Measured: 1181 files in the graph',
        'before, 1171 after. The push script now refuses if the exclusion is removed.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.938 pushed - the purchase orders, and the API hole 936 shipped" -ForegroundColor Green
}
