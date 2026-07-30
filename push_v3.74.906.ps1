$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.906 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.905.ps1") { Remove-Item -LiteralPath "push_v3.74.905.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.906"') {
    Write-Host "+ 3.74.906" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.906]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.906]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260730000005_v3_74_906_purchase_cost_visibility_rule.sql"
$snapshot  = "supabase/schema/schema.sql"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $snapshot, "push_v3.74.906.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the rule, the read path and the owner-only switch all exist --------
$m = Get-Content -LiteralPath $migration -Raw
foreach ($fn in @("can_view_purchase_cost", "product_costs", "set_purchase_cost_visibility")) {
    if ($m -notmatch [regex]::Escape($fn)) {
        Write-Host "X the migration lost $fn" -ForegroundColor Red; exit 1
    }
}
# the three modes the owner decided on, by name
foreach ($mode in @("'open'", "'restricted'", "'strict'")) {
    if ($m -notmatch [regex]::Escape($mode)) {
        Write-Host "X visibility mode $mode is gone from the rule" -ForegroundColor Red; exit 1
    }
}
# and the parts of the rule that carry the decision itself
foreach ($needle in @("'owner', 'general_manager'", "'accountant', 'purchasing_officer'", "p_created_by = v_actor", "OWNER_ONLY")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X the rule no longer reads as the owner decided it" -ForegroundColor Red; exit 1
    }
}
# product cost is measured by role alone - no creator exception (owner decision)
if ($m -notmatch [regex]::Escape("can_view_purchase_cost(p.company_id, NULL)")) {
    Write-Host "X product cost stopped being role-only - a creator exception crept back in" -ForegroundColor Red; exit 1
}
# nothing reaches these functions anonymously
foreach ($needle in @("public.can_view_purchase_cost(uuid, uuid) FROM anon",
                      "public.product_costs(uuid[]) FROM anon",
                      "public.set_purchase_cost_visibility(uuid, text) FROM anon")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X a cost function is left reachable by anonymous callers" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the cost rule is defined once, carries the owner decision, and is closed to anon" -ForegroundColor Green

# -- 2. the snapshot knows the new column (the battery compares them) ------
$sn = Get-Content -LiteralPath $snapshot -Raw
if ($sn -notmatch [regex]::Escape("purchase_cost_visibility text DEFAULT 'restricted'::text NOT NULL")) {
    Write-Host "X the schema snapshot does not carry the new companies column" -ForegroundColor Red; exit 1
}
Write-Host "+ the schema snapshot carries the visibility column" -ForegroundColor Green

# -- 2b. the old CHECK is dropped BEFORE the values are corrected ---------
# Applying it the other way round is not theory: the first apply died with
# 23514 because the old constraint refused the new value as it was written.
$iDrop = $m.IndexOf("DROP CONSTRAINT IF EXISTS companies_purchase_cost_visibility_check")
$iUpd  = $m.IndexOf("SET purchase_cost_visibility = 'restricted'")
if ($iDrop -lt 0 -or $iUpd -lt 0 -or $iDrop -gt $iUpd) {
    Write-Host "X the old CHECK must be dropped before the values are corrected (23514)" -ForegroundColor Red; exit 1
}
Write-Host "+ the migration drops the old check before rewriting the values" -ForegroundColor Green

# -- 3. this release claims no hiding it did not do -----------------------
# 906 states the rule; the REVOKE lands later, AFTER the 11 select(*) sites
# on products are cleared. A REVOKE here would break live screens.
if ($m -match [regex]::Escape("REVOKE SELECT (cost_price")) {
    Write-Host "X 906 must not revoke the column - 11 select(*) sites still read it" -ForegroundColor Red; exit 1
}
Write-Host "+ 906 states the rule without pretending to enforce it yet" -ForegroundColor Green

# -- 4. the battery below still proves both standing guards ----------------
$self = Get-Content -LiteralPath "push_v3.74.906.ps1" -Raw
if ($self -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery still plants both probes and watches both guards refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.905.ps1" 2>$null

# -- 5. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.905.ps1")
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
git add -u -- "push_v3.74.905.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_906.txt"
    $msgLines = @(
        'feat(security): v3.74.906 - the purchase-cost visibility rule, written once before it is enforced anywhere',
        '',
        'A real customer asked to hide purchase prices from his users and',
        'was advised to buy on the main branch and transfer the stock to',
        'the selling branch. Measured against production, that advice',
        'hides nothing: impersonating a plain staff member of one branch',
        'read the cost of 12 products (max 200.00), 6 purchase bills, 11',
        'bill lines (max unit price 50.00) and 39 inventory movements.',
        'The reason is structural - products_select is',
        'is_company_member(company_id) with no branch or role condition,',
        'and the cost lives on the PRODUCT, not on the document, so moving',
        'stock between branches never touches it. Worse, the branch',
        'isolation policies on bills and inventory_transactions are',
        'written but neutralised: multiple PERMISSIVE policies are OR-ed,',
        'and the any-member policy beside them wins.',
        '',
        'OWNER DECISION, and then its correction. First: only the creator',
        'sees a purchase price, owner and general manager excepted. Then,',
        'once it was put to him that an accountant closes no books, checks',
        'no inventory valuation and reconciles no COGS without cost - and',
        'usually did not create the purchase bills - the rule became',
        'per-company, its default audience grew to include the accountant',
        'and the purchasing officer (who negotiates, as settled in 905),',
        'and product cost lost the creator exception (the person who',
        'created a product may be a salesperson, and its cost changes with',
        'purchases that are none of their doing).',
        '',
        'companies.purchase_cost_visibility, checked and defaulted:',
        '  open       - every company member (old behaviour)',
        '  restricted - owner + GM + accountant + purchasing officer + the',
        '               document creator  [DEFAULT]',
        '  strict     - owner + GM + the document creator',
        'Product cost, FIFO layers and valuation are measured by role',
        'alone, since none of them has a creator at all - products carries',
        'no creator column, which was measured, not assumed.',
        '',
        'The rule is defined exactly once - can_view_purchase_cost',
        '(company_id, created_by) - so it cannot drift into ten',
        'contradicting copies; product_costs(ids) is the authorised read',
        'path that will replace reading the column; and',
        'set_purchase_cost_visibility is OWNER-ONLY, because whoever sees',
        'the cost does not get to decide who sees it, and a setting nobody',
        'can change is a dead setting.',
        '',
        'Proven by cancelled transactions on test, byte-identical on',
        'production (b5dc5f77a1 / 691dc8892c / 755177731b): under the',
        'default the purchasing officer and the accountant each see 8',
        'product costs, while the store manager and a sales staff member',
        'see 0 and keep only their own document; under strict both drop to',
        '0 and keep their own; under open the staff member sees 8. The',
        'switch refuses the accountant with OWNER_ONLY, refuses a stale',
        'mode name with BAD_MODE, and the owner write actually lands.',
        'Anonymous is false in every mode.',
        '',
        'One defect caught by the first apply and now guarded in the push',
        'script: the migration corrected the values before dropping the old',
        'CHECK, so the old constraint refused the new value as it was being',
        'written (23514). The constraint is dropped first.',
        '',
        'What this release deliberately does NOT do: hide anything. The',
        'REVOKE on the cost columns lands only after the 11 measured',
        'select(*) sites on products are converted to named columns (5 of',
        'them are manufacturing API routes running on the user session,',
        'not service_role, so they would break). Shipping a hide that is',
        'not a hide would be the same theatre this project just removed',
        'from the purchase-order footer. Operational note: once the hide',
        'does land, the default restricts existing companies too - anyone',
        'wanting the old behaviour sets their company to open.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.906 pushed - the rule is written once; the enforcement comes next, and it will be real" -ForegroundColor Green
}
