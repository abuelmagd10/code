$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.929 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.928.ps1") { Remove-Item -LiteralPath "push_v3.74.928.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.929"') {
    Write-Host "+ 3.74.929" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.929]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.929]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260731000018_v3_74_929_movement_tables_branch_isolation.sql"
$guard     = "scripts/check-branch-isolation-holes.js"
$trap      = "scripts/selftest-branch-isolation-holes.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $guard, $trap,
           "push_v3.74.929.ps1")

$m = Get-Content -LiteralPath $migration -Raw
$g = Get-Content -LiteralPath $guard -Raw
$t = Get-Content -LiteralPath $trap -Raw

# -- 1. the swallowing policies on inventory_transactions are gone ------
foreach ($needle in @("DROP POLICY IF EXISTS inventory_company_isolation",
                      "DROP POLICY IF EXISTS inventory_transactions_select_members",
                      "DROP POLICY IF EXISTS inventory_transactions_update_members",
                      "DROP POLICY IF EXISTS inventory_transactions_delete_members",
                      "DROP POLICY IF EXISTS fifo_lots_company_isolation")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X a swallowing policy survives ($needle)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the branch isolation written on inventory_transactions can finally bite" -ForegroundColor Green

# -- 2. write access is NOT restored with FOR ALL (926 lesson) ----------
if ($m -match "CREATE POLICY[^;]*FOR ALL") {
    Write-Host "X write access was restored with FOR ALL - it would reopen the read" -ForegroundColor Red
    exit 1
}
foreach ($needle in @("fifo_cost_lots_insert_company", "fifo_cost_lots_update_company",
                      "fifo_cost_lots_delete_company")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X write access on the lots was dropped instead of split ($needle)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ lot writes are split into INSERT/UPDATE/DELETE, not restored as ALL" -ForegroundColor Green

# -- 3. the two sleeping doors are shut, all three ways -----------------
# They were SECURITY INVOKER, they FAILED OPEN (a warning, and an
# understated cost returned), and they never asked which company. Isolating
# the lots would have turned them from correct into silently wrong.
if ($m -notmatch [regex]::Escape("FIFO_LOTS_INSUFFICIENT")) {
    Write-Host "X the FIFO helpers still fail open - an understated cost would pass" -ForegroundColor Red
    exit 1
}
if ($m -notmatch [regex]::Escape("AND company_id = v_company_id")) {
    Write-Host "X the FIFO helpers still do not ask which company" -ForegroundColor Red; exit 1
}
$definerCount = ([regex]::Matches($m, "SECURITY DEFINER")).Count
if ($definerCount -lt 2) {
    Write-Host "X a FIFO helper is still SECURITY INVOKER - the 915 trap" -ForegroundColor Red; exit 1
}
Write-Host "+ both sleeping FIFO doors read as definer, scope by company, and fail loudly" -ForegroundColor Green

# -- 3b. and the cure itself is measured -------------------------------
# Making them SECURITY DEFINER handed them to PUBLIC, which includes anon -
# Postgres grants EXECUTE to PUBLIC on every CREATE FUNCTION. The battery
# caught it before the push, not after. The cure is measured too.
foreach ($needle in @("REVOKE ALL ON FUNCTION public.calculate_fifo_cogs",
                      "REVOKE ALL ON FUNCTION public.calculate_fifo_cost")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X the definer cure left the helpers open to PUBLIC/anon" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the cure was measured too - the helpers are service_role only" -ForegroundColor Green

# -- 4. the three tables joined the guard, and the trap plants on cost --
foreach ($needle in @('"inventory_transactions"', '"fifo_cost_lots"', '"cogs_transactions"')) {
    if ($g -notmatch [regex]::Escape($needle)) {
        Write-Host "X a newly closed table never joined the guard ($needle)" -ForegroundColor Red; exit 1
    }
}
if ($t -notmatch [regex]::Escape("cogs_company_wide")) {
    Write-Host "X the trap never plants a leak on the bare-cost table" -ForegroundColor Red; exit 1
}
if ($t -notmatch [regex]::Escape("- cogs_transactions:")) {
    Write-Host "X the trap does not require the guard to NAME cogs_transactions" -ForegroundColor Red; exit 1
}
if ($t -match "on (TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|BOTH) (different )?(tables|shapes)") {
    Write-Host "X the trap closing line counts tables again" -ForegroundColor Red; exit 1
}
Write-Host "+ the nineteen are closed, guarded, and the bare-cost table is planted on" -ForegroundColor Green

# -- 5. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.929.ps1" -Raw
if ($self2 -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-products-branch-policy.js")) {
    Write-Host "X the branch-rules guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-branch-isolation-holes.js")) {
    Write-Host "X the branch-isolation guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-transfer-journal.js")) {
    Write-Host "X the transfer-journal mechanism is not proven in this battery" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.928.ps1" 2>$null

# -- 6. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.928.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving an exposed SECURITY DEFINER writer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-exposed-definer-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the definer-exposure guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Auditing SECURITY DEFINER writers on the live database..." -ForegroundColor Cyan
node scripts/check-exposed-definer-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a full-rights writer is reachable by end users" -ForegroundColor Red; exit 1 }

Write-Host "Proving an unposted cross-branch transfer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-transfer-journal.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the transfer-journal mechanism was not proven" -ForegroundColor Red; exit 1 }

Write-Host "Proving the branch-isolation guard catches the real leak - now on ELEVEN shapes (TEST only)..." -ForegroundColor Cyan
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
git add -u -- "push_v3.74.928.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_929.txt"
    $msgLines = @(
        'feat(security): v3.74.929 - the movement tables are isolated by branch, and two sleeping doors are shut',
        '',
        'The last three of the nineteen, and the ones where cost lives BARE -',
        'not inside a document line with a parent to protect it.',
        '',
        'inventory_transactions carried a branch-isolation policy that is',
        'entirely correct, and beside it a plain company-membership policy that',
        'SWALLOWED IT - on select, update and delete alike - plus a third dead',
        'policy on app.current_company_id, the same one removed in 922. Fifth',
        'time a rule was known and not in force, second time it was written on',
        'the table itself and disabled by its neighbour. No question to ask',
        'here: the swallowing policies are dropped and the isolation stands as',
        'written.',
        '',
        'fifo_cost_lots had one is_company_member policy covering read AND write,',
        'and cogs_transactions a company-wide read. Both carry unit_cost. The',
        'owner decided: read them within the branch - which completes the cost',
        'hide of 906 to 916, since otherwise the number hidden on the product is',
        'read straight off the lot. Lot writes were NOT restored with FOR ALL',
        '(the 926 lesson) but split into insert, update and delete with their',
        'old text word for word.',
        '',
        'AND THE EFFECT ON THE BOOKS IS ZERO - measured before writing. FIFO',
        'consumption runs in consume_fifo_lots and the cost entry in the',
        'auto_create_cogs_journal trigger, and BOTH ARE SECURITY DEFINER, so no',
        'read policy touches them. Isolating the read does not move a single',
        'number in the posting.',
        '',
        'TWO SLEEPING DOORS, SHUT - and there is money behind them. ',
        'calculate_fifo_cogs and calculate_fifo_cost were SECURITY INVOKER,',
        'reading the lots with the privileges of whoever called them, and they',
        'carried two defects. First, THEY FAILED OPEN: short of lots they',
        'returned a SMALLER COST and raised only a warning - so called from a',
        'user session after this isolation they would have produced an',
        'understated cost in silence. Second, THEY NEVER ASKED WHICH COMPANY',
        '(WHERE product_id = ... and nothing more) - what protected them was',
        'RLS alone, so under the service key, which bypasses RLS, they would',
        'have read another company lots.',
        '',
        'They are asleep - no trigger calls them and no line in the application',
        '(measured; the live trigger is another function). But ASLEEP IS NOT',
        'IMPOSSIBLE, which is the sentence from 919. Both are now SECURITY',
        'DEFINER so they read the truth rather than what is visible, both derive',
        'the company from the product so no signature changes and no caller',
        'breaks, and both raise FIFO_LOTS_INSUFFICIENT instead of letting a',
        'short cost through.',
        '',
        'PROVEN on production after applying: every branch member sees 35',
        'movements, 12 lots and 3 cost entries - ZERO of them from Nasr City -',
        'while the owner and the registered owner see 42, 15 and 4.',
        '',
        'THE LIST OF NINETEEN IS NOW CLOSED. Nine releases, 921 to 929, and with',
        'them SEVEN TABLES THAT WERE NEVER ON THE LIST, found by measuring: the',
        'purchase-return warehouse allocations, sales_returns, and five of the',
        'bookings family. The guard now measures nineteen heads and twelve line',
        'tables, and the trap plants eleven distinct shapes of the leak.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.929 pushed - the movement tables belong to their branch: THE NINETEEN ARE CLOSED" -ForegroundColor Green
}
