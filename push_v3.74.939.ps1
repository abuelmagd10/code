$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.939 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.938.ps1") { Remove-Item -LiteralPath "push_v3.74.938.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.939"') {
    Write-Host "+ 3.74.939" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.939]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.939]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260802000001_v3_74_939_notifications_reach_a_person.sql"
$guard     = "scripts/check-notifications-reach-a-person.js"
$trap      = "scripts/selftest-notifications-reach-a-person.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $guard, $trap,
           "push_v3.74.939.ps1")

$m = Get-Content -LiteralPath $migration -Raw
$g = Get-Content -LiteralPath $guard -Raw
$t = Get-Content -LiteralPath $trap -Raw

# -- 1. the rule sits on the TABLE, not in a function anyone can bypass --
# create_notification exists, but TWENTY-FOUR functions insert into
# notifications directly and skip it (measured by reading their bodies). A
# rule written in that function is a placebo - the 935 lesson exactly.
if ($m -notmatch [regex]::Escape("BEFORE INSERT ON public.notifications")) {
    Write-Host "X the routing rule is not a trigger on the table - 24 writers would bypass it" -ForegroundColor Red
    exit 1
}
if ($m -notmatch [regex]::Escape("company_role_has_holder")) {
    Write-Host "X there is no single home for 'does anyone hold this role'" -ForegroundColor Red; exit 1
}
Write-Host "+ the routing rule sits on the table itself, where no writer can step past it" -ForegroundColor Green

# -- 2. it spares a role that HAS a holder, and it says why it moved -----
# A rule that rewrites every row protects nothing, and a silent reroute hides
# that the company is missing a job.
if ($m -notmatch [regex]::Escape("IF public.company_role_has_holder(NEW.company_id, NEW.assigned_to_role) THEN")) {
    Write-Host "X the trigger does not spare a role that has a holder" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("v3.74.939] كان هذا الإشعارُ موجَّهاً إلى دور")) {
    Write-Host "X the reroute is silent - the missing role would never be noticed" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("IF v_owner IS NULL THEN")) {
    Write-Host "X a company with no owner would lose the notification instead of keeping it" -ForegroundColor Red
    exit 1
}
Write-Host "+ it spares a role with a holder, says why it moved, and never drops a notification" -ForegroundColor Green

# -- 3. the staleness check asks by ID, not by a CASE on the type name ---
# The CASE is what produced the false alarm: an unlisted reference_type fell
# to ELSE TRUE and was counted forever. All five alarms pointed at PRET-5689,
# which is completed.
if ($m -notmatch [regex]::Escape("workflow_row_is_open")) {
    Write-Host "X the staleness check still keys off the reference_type name" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("RETURN NULL;   -- لا صفَّ له فى أى جدولٍ نعرفه")) {
    Write-Host "X an unknown document is not distinguished from a pending one" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("unverified_count")) {
    Write-Host "X what the check cannot verify is not reported - it would be swallowed or cried over" -ForegroundColor Red
    exit 1
}
Write-Host "+ the check asks by id, and names what it cannot verify instead of claiming it is pending" -ForegroundColor Green

# -- 4. 'finished' is the closed list, not 'pending' ---------------------
# Pending vocabularies differ per table and grow with every feature; terminal
# words are few and shared. A status added tomorrow counts as OPEN - seen and
# asked about, not swallowed.
if ($m -notmatch [regex]::Escape("ELSE TRUE")) {
    Write-Host "X an unknown status would be treated as finished - work would vanish quietly" -ForegroundColor Red
    exit 1
}
Write-Host "+ an unknown status counts as still open, so nothing disappears in silence" -ForegroundColor Green

# -- 5. and the guard measures WHERE a notification lands, not the text --
if ($g -notmatch [regex]::Escape("INSERT INTO public.notifications")) {
    Write-Host "X the guard reads text instead of planting a real notification" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("ROLLBACK")) {
    Write-Host "X the guard would leave its probes behind" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("a rule that rewrites everything protects nothing")) {
    Write-Host "X the guard never checks that an innocent role is spared" -ForegroundColor Red; exit 1
}
foreach ($needle in @("the routing trigger dropped",
                      "a trigger that reroutes even a role that HAS a holder",
                      "a trigger that reroutes in silence",
                      "the staleness check back on the 215 catch-all",
                      "anon granted execute on the routing function")) {
    if ($t -notmatch [regex]::Escape($needle)) {
        Write-Host "X the trap no longer plants: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the guard measures where a notification lands, and the trap plants all five shapes" -ForegroundColor Green

# -- 6. a dropped connection is not a measurement ------------------------
foreach ($dbg in @("scripts/check-notifications-reach-a-person.js",
                   "scripts/check-purchase-cost-masked-path.js",
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

# -- 7. the scratch folders stay out of the type-check graph (938) -------
$ts = Get-Content -LiteralPath "tsconfig.json" -Raw
if ($ts -notmatch [regex]::Escape('"_wip_*"')) {
    Write-Host "X tsconfig no longer excludes _wip_* - scratch copies would be type-checked" -ForegroundColor Red
    exit 1
}
Write-Host "+ scratch folders are outside the type-check graph" -ForegroundColor Green

# -- 8. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.939.ps1" -Raw
foreach ($needle in @("check-je-default-status.js --prove --require-db",
                      "check-anon-open-tables.js --prove --require-db",
                      "selftest-products-branch-policy.js",
                      "selftest-branch-isolation-holes.js",
                      "selftest-transfer-journal.js",
                      "selftest-purchase-cost-masked-path.js",
                      "selftest-cost-rule-has-one-home.js",
                      "selftest-product-management-one-door.js",
                      "selftest-purchase-money-direct-read.js",
                      "selftest-notifications-reach-a-person.js")) {
    if ($self2 -notmatch [regex]::Escape($needle)) {
        Write-Host "X the push battery no longer proves: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.938.ps1" 2>$null

# -- 10. nothing staged beyond this release (the 872 lesson) -------------
$expected = @($files) + @("push_v3.74.938.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the routing guard refuses all five shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-notifications-reach-a-person.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the routing guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring where a notification actually lands, by planting one on the live database..." -ForegroundColor Cyan
node scripts/check-notifications-reach-a-person.js --require-db --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a notification can still be sent where nobody will read it" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.938.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_939.txt"
    $msgLines = @(
        'fix(ops): v3.74.939 - a notification reaches a person, and the alarm stops crying wolf',
        '',
        'A dashboard drift item ("1 low") turned out to be a FALSE ALARM BY',
        'CONSTRUCTION - and underneath it sat a real defect it had been hiding.',
        '',
        'THE ALARM. ic_stale_critical_notifications (215) requires the underlying',
        'workflow to still be pending, but it knows only six reference_types and',
        'everything else falls through to ELSE TRUE - counted forever. All five',
        'flagged rows pointed at PRET-5689, whose status is completed. Measured:',
        '24 of 30 types uncovered, carrying 165 critical/high notifications, every',
        'one of them a false alarm waiting to turn 30 days old. A guard that cries',
        'wolf gets switched off within a week.',
        '',
        'THE CURE WAS NOT A LONGER LIST. The CASE on the type name is what produced',
        'the bug. The question is now asked BY ID: workflow_row_is_open(uuid) searches',
        'twenty-one tables and answers three ways - TRUE pending, FALSE finished, and',
        'NULL not found anywhere. approval_request carries the DOCUMENT id, not an',
        'approval-record id (measured on PRET-5689), so asking by id hits where',
        'matching by name misses. What cannot be verified is REPORTED SEPARATELY,',
        'named and counted - visible debt, not a false alarm.',
        '',
        'And "finished" is the closed list, not "pending": pending vocabularies differ',
        'per table and grow with every feature, terminal words are few and shared. A',
        'status added tomorrow counts as OPEN - seen and asked about, not swallowed.',
        '',
        'THE REAL DEFECT UNDERNEATH: 35 unread notifications addressed to roles NOBODY',
        'HOLDS - general_manager (18), admin (14), warehouse_manager (3), with zero',
        'members in those roles in ANY company. An approval sent to an empty role is',
        'an approval that is never taken.',
        '',
        'AND THE RULE WENT WHERE IT CANNOT BE BYPASSED. create_notification exists,',
        'but TWENTY-FOUR functions insert into the table directly and skip it (nine',
        'call it) - measured by reading their bodies. A rule written in that function',
        'is a placebo: the 935 lesson exactly. So the rule is a BEFORE INSERT TRIGGER',
        'on the table itself. No writer steps past it, and the twenty-fifth writer is',
        'covered the day it is written.',
        '',
        'THE REROUTE SAYS WHY. It reaches the owner carrying "this was addressed to',
        'role X and nobody holds it" - a silent reroute would hide that the company',
        'is missing a job. And no notification is ever dropped: a company with no',
        'owner keeps the row as it is (zero such companies, measured).',
        '',
        'THE BACKFILL MOVED WHAT WAS ACTUALLY STUCK, AND NOTHING ELSE: 0 rows moved,',
        '119 left as log lines for work already finished. Nothing is stuck today -',
        'the value of this release is forward-looking, and it is said rather than',
        'dressed up.',
        '',
        'THE GUARD MEASURES WHERE A NOTIFICATION LANDS, NOT WHAT THE CODE SAYS: it',
        'plants a real row inside a rolled-back transaction and looks. A role with no',
        'holder must reach the owner and say why; A ROLE WITH A HOLDER MUST BE LEFT',
        'ALONE; one already addressed to a person must be untouched; and the staleness',
        'check must fire for a pending document and stay silent for a resolved one.',
        'The trap plants five shapes on the test database - including a trigger that',
        'reroutes EVERYTHING, the nastiest of them, because it looks like it works.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)

    # v3.74.939 - a stale index.lock appeared DURING the battery (a guard that
    # shells out to git leaves one behind), the commit failed, `git push` then
    # said "Everything up-to-date" and the banner declared success. THE SCRIPT
    # LIED ABOUT ITS OWN RELEASE. Deleting the lock at the top is not enough:
    # it has to be gone at the moment of the commit.
    if (Test-Path -LiteralPath ".git/index.lock") {
        Write-Host "! a stale .git/index.lock was left by an earlier step - removing it" -ForegroundColor Yellow
        Remove-Item -LiteralPath ".git/index.lock" -Force -ErrorAction SilentlyContinue
    }

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X git commit FAILED - nothing was recorded. NOT pushing." -ForegroundColor Red
        Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

# -- the commit is not assumed: it is READ BACK -------------------------
# An exit code says the command returned; only the log says the release exists.
$headSubject = git log -1 --format=%s
if ($headSubject -notmatch [regex]::Escape("v3.74.939")) {
    Write-Host "X HEAD is not this release ($headSubject) - refusing to claim a push" -ForegroundColor Red
    exit 1
}
Write-Host "+ the commit is on HEAD: $headSubject" -ForegroundColor Green

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { Write-Host "X git push failed" -ForegroundColor Red; exit 1 }

# -- and neither is the push: the remote is READ BACK -------------------
# "Everything up-to-date" is exit 0. It means nothing was sent - which is a
# success only if the remote already has this commit.
$localHead  = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse origin/main).Trim()
if ($localHead -ne $remoteHead) {
    Write-Host "X origin/main is $remoteHead but HEAD is $localHead - the push did NOT land" -ForegroundColor Red
    exit 1
}
Write-Host "`n+ v3.74.939 pushed - a notification reaches a person, and the alarm stops crying wolf" -ForegroundColor Green
Write-Host "  HEAD = origin/main = $localHead" -ForegroundColor DarkGray
