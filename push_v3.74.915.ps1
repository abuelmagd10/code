$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.915 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.914.ps1") { Remove-Item -LiteralPath "push_v3.74.914.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.915"') {
    Write-Host "+ 3.74.915" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.915]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.915]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260731000005_v3_74_915_product_visibility_by_branch.sql"
$screens   = @("app/api/products-list/route.ts", "app/estimates/page.tsx",
               "app/sales-orders/new/page.tsx", "app/invoices/new/page.tsx")

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration,
           "scripts/check-products-branch-policy.js",
           "scripts/selftest-products-branch-policy.js",
           "push_v3.74.915.ps1") + $screens

# -- 1. the policy has all three arms ------------------------------------
# Drop any one of them and the release stops doing what the owner asked:
# without (1) a company-wide member loses every product; without (2) a
# branch member loses his own; without (3) he never sees what was moved to
# him - which is the whole point, because a transfer moves quantity and
# never touches the product card.
$m = Get-Content -LiteralPath $migration -Raw
foreach ($needle in @("cm.branch_id IS NULL",
                      "cm.branch_id = products.branch_id",
                      "FROM inventory_transactions t")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X the branch visibility rule is missing an arm ($needle)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ products_select scopes by branch AND by what moved into it" -ForegroundColor Green

# -- 2. the isolation trigger is SECURITY DEFINER ------------------------
# MEASURED, not feared: as SECURITY INVOKER it reads products through the
# caller's eyes, so after this release another branch's product returns
# NULL - and NULL means "company product, no branch" in its own logic, so
# it PASSES exactly what it exists to refuse. Proven on the test database:
# PASSED as invoker, REFUSED as definer.
if ($m -notmatch [regex]::Escape("SECURITY DEFINER")) {
    Write-Host "X validate_product_branch_isolation must be SECURITY DEFINER or this release opens a hole" -ForegroundColor Red
    exit 1
}
$iDef = $m.IndexOf("CREATE OR REPLACE FUNCTION public.validate_product_branch_isolation")
$iSel = $m.IndexOf("DROP POLICY IF EXISTS products_select")
if ($iDef -lt 0 -or $iSel -lt 0) {
    Write-Host "X the migration must carry BOTH the policy and the trigger fix - never one alone" -ForegroundColor Red
    exit 1
}
Write-Host "+ the policy and the SECURITY DEFINER fix travel together, in one migration" -ForegroundColor Green

# -- 3. the sale-after-transfer exception is for SALES ONLY --------------
if ($m -notmatch [regex]::Escape("IN ('invoice_items', 'sales_order_items')")) {
    Write-Host "X the transfer exception no longer names the two sales tables" -ForegroundColor Red; exit 1
}
foreach ($buy in @("'bill_items'", "'purchase_order_items'", "'purchase_return_items'", "'vendor_credit_items'")) {
    $exc = $m.Substring($m.IndexOf("IN ('invoice_items', 'sales_order_items')"))
    $exc = $exc.Substring(0, [Math]::Min(600, $exc.Length))
    if ($exc.Contains($buy)) {
        Write-Host "X the purchase side crept into the sale-after-transfer exception ($buy)" -ForegroundColor Red
        exit 1
    }
}
if ($m -notmatch [regex]::Escape("t.quantity_change > 0")) {
    Write-Host "X the exception no longer requires goods to have actually arrived in the branch" -ForegroundColor Red
    exit 1
}
Write-Host "+ selling a transferred item is allowed only where stock actually arrived; buying is untouched" -ForegroundColor Green

# -- 4. no screen filters products by branch behind the policy's back ----
# Every one of these said `branch_id = mine OR branch_id IS NULL`, which
# BOTH dropped what was transferred in AND showed the branchless product
# the owner asked to hide. A filter in code is forgotten in one screen and
# bypassed by a direct call; the rule lives in the policy now.
# The regex is deliberately narrow: these files DO filter customers and
# estimates by branch, and rightly so. Only the PRODUCTS query is at issue.
foreach ($s in $screens) {
    $src = Get-Content -LiteralPath $s -Raw
    if ($src -match '(productsQuery|prodQuery|prodsQuery)[A-Za-z]*\s*=\s*(productsQuery|prodQuery|prodsQuery)[A-Za-z]*\.or\(.{0,3}branch_id\.eq\.' -or
        $src -match "\.eq\('branch_id', branchId\)") {
        Write-Host "X $s filters products by branch again - it would hide what was transferred in" -ForegroundColor Red
        exit 1
    }
    if ($src -notmatch [regex]::Escape("v3.74.915")) {
        Write-Host "X $s carries no note saying why the branch filter is gone - the next hand will put it back" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no product screen re-filters by branch, and each says why" -ForegroundColor Green

# -- 5. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.915.ps1" -Raw
if ($self2 -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-products-branch-policy.js")) {
    Write-Host "X the new branch-visibility guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.914.ps1" 2>$null

# -- 6. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.914.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the branch-visibility guard refuses all three reversions (TEST database only)..." -ForegroundColor Cyan
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
git add -u -- "push_v3.74.914.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_to_delete") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_915.txt"
    $msgLines = @(
        'feat(security): v3.74.915 - a branch member sees his branch products, and whatever arrived in his branch',
        '',
        'OWNER DECISION, in his words: a branchless product is not seen by',
        'branch users at all and cannot be purchased by them; and after the',
        'purchase is TRANSFERRED to a branch, they may sell it without seeing',
        'its purchase cost.',
        '',
        'His wording about the transfer is decisive: the product stays with no',
        'branch change and only the quantity moves. So a naive rule - "you see',
        'your branch products" - would hide from him the very thing that was',
        'moved to him, and he could never sell it. The two measures diverge on',
        'purpose: VISIBILITY is my branch product OR what moved in my branch;',
        'COST is my branch product alone (914).',
        '',
        'The rule now lives where it cannot be forgotten. products_select said',
        'is_company_member(company_id) and nothing else - every member read',
        'every product straight from the database - while the branch filter',
        'lived in /api/products-list and nine other screens, each in its own',
        'dialect. Four of them are removed here; the policy decides.',
        '',
        'THE DANGEROUS PART, and why the trigger fix ships in the SAME',
        'migration: validate_product_branch_isolation was SECURITY INVOKER. It',
        'asks "which branch owns this product?" through the caller eyes. Once',
        'visibility narrowed, another branch product came back NULL - and NULL',
        'means "company product, no branch" in its own logic, so it PASSED.',
        'Narrowing visibility alone would have UNDONE a standing accounting',
        'guard while looking like it was tightening one. Measured on test in a',
        'cancelled transaction: a branch staff member putting another branch',
        'product on his own branch invoice - PASSED as invoker, REFUSED as',
        'definer.',
        '',
        'Second fix: selling what was transferred in now passes - for the two',
        'sales tables only, and only where goods actually ARRIVED in that',
        'branch (a positive movement). The purchase side is untouched.',
        '',
        'Proven on test in cancelled transactions: before the transfer the sale',
        'is refused; after a transfer_in it is allowed; the purchase side stays',
        'refused even with the goods present. Staff sees 5 of 8, not the other',
        'branch product, not the branchless one, sees what was moved to him',
        'with cost 0, and the owner still sees 8.',
        '',
        'Measured on production after applying: 12 products - owner 12, every',
        'branch member 9. And before writing: ZERO branchless products, ZERO',
        'document lines pointing at another branch product, ZERO transfers ever',
        'issued. Nothing loses a row today; the gap is closed before the first',
        'transfer.',
        '',
        'New guard check-products-branch-policy.js measures the LIVE database,',
        'because this defect never appears in a file: it refuses a',
        'membership-only policy, a PERMISSIVE policy sitting beside it (the',
        'nastiest - permissive policies are OR-ed, so the rule stays written',
        'and stops working), and a SECURITY INVOKER isolation trigger. Its',
        'selftest plants all three on the test database, watches it refuse, and',
        'restores the policy text read from the migration file itself.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.915 pushed - the branch sees its own products and what arrived in it; and the isolation guard can see again" -ForegroundColor Green
}
