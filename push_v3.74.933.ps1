$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.933 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.932.ps1") { Remove-Item -LiteralPath "push_v3.74.932.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.933"') {
    Write-Host "+ 3.74.933" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.933]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.933]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260731000022_v3_74_933_purchase_cost_authorised_path.sql"
$guard     = "scripts/check-purchase-cost-masked-path.js"
$trap      = "scripts/selftest-purchase-cost-masked-path.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $guard, $trap,
           "supabase/schema/functions.sql",
           "push_v3.74.933.ps1")

$m = Get-Content -LiteralPath $migration -Raw
$g = Get-Content -LiteralPath $guard -Raw
$t = Get-Content -LiteralPath $trap -Raw

# Measure on CODE only. Twice now a check fired on the migration header quoting
# the very string it forbids (930 and 932). A comment is not an instruction.
$mCode = ($m -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"

# -- 1. six masked views, every one of them reading as its CALLER -------
# A view with its owner rights would step over every branch-isolation policy
# built from 917 to 932 - while working perfectly and reporting nothing.
$viewCount = ([regex]::Matches($mCode, [regex]::Escape("WITH (security_invoker = true)"))).Count
if ($viewCount -ne 6) {
    Write-Host "X expected 6 masked views with security_invoker, found $viewCount" -ForegroundColor Red
    exit 1
}
Write-Host "+ six masked views, each reading with the rights of its caller" -ForegroundColor Green

# -- 2. and not one of them reads a money column from its own table -----
# If it did, the money would be shown to everyone AND the view itself would
# break the day the column is revoked in stage 3.
#
# Measured on the VIEW section only. The money functions read b.total_amount
# by design - that is their whole job - so a check over the whole file would
# fire on the cure instead of the disease.
$viewStart = $mCode.IndexOf("CREATE VIEW")
if ($viewStart -lt 0) { Write-Host "X no CREATE VIEW in the migration" -ForegroundColor Red; exit 1 }
$mViews = $mCode.Substring($viewStart)
foreach ($pair in @("m.unit_price", "m.line_total", "m.total_amount", "m.subtotal", "m.paid_amount")) {
    if ($mViews -notmatch [regex]::Escape($pair)) {
        Write-Host "X a masked view does not take $pair from the authorised path" -ForegroundColor Red; exit 1
    }
}
foreach ($bad in @("b.unit_price", "b.line_total", "b.total_amount", "b.paid_amount", "b.subtotal")) {
    if ($mViews -match [regex]::Escape($bad)) {
        Write-Host "X a masked view reads $bad straight from its table - the hide is decoration" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no masked view reads a money column from its own table" -ForegroundColor Green

# -- 3. the default privileges are revoked BEFORE the read is granted ---
# This database hands ALL privileges to authenticated on every new view.
# Measured while writing 933: the first cut granted INSERT/UPDATE/DELETE.
$revokeCount = ([regex]::Matches($mCode, [regex]::Escape("FROM PUBLIC, anon, authenticated"))).Count
if ($revokeCount -lt 6) {
    Write-Host "X a masked view keeps the default ALL grant to authenticated ($revokeCount of 6 revoked)" -ForegroundColor Red
    exit 1
}
if (([regex]::Matches($mCode, [regex]::Escape("REVOKE ALL    ON FUNCTION"))).Count -lt 8) {
    Write-Host "X a new function is left open to PUBLIC - and PUBLIC includes anon (919/929)" -ForegroundColor Red
    exit 1
}
Write-Host "+ what was not wanted is revoked first, on all six views and all eight functions" -ForegroundColor Green

# -- 4. one rule, called from two places, never written twice -----------
# The money function must ask the SAME question the row policy asks. If the
# policy writes the condition by hand again, the rule has two copies and
# changing one leaves the other open in silence.
foreach ($needle in @("USING (public.can_access_bill(id))",
                      "USING (public.can_access_purchase_order(id))",
                      "public.can_access_bill(b.id)",
                      "public.can_access_purchase_order(b.id)")) {
    if ($mCode -notmatch [regex]::Escape($needle)) {
        Write-Host "X the visibility rule is not called from both places ($needle)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ one visibility rule per head, called by the policy AND by the money function" -ForegroundColor Green

# -- 5. the guard measures the effect, not the text ---------------------
if ($g -notmatch [regex]::Escape("pg_depend")) {
    Write-Host "X the guard reads the view text instead of measuring what it depends on" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("set_config")) {
    Write-Host "X the guard does not impersonate anybody - it would measure nothing" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("scopedMoneyCount")) {
    Write-Host "X the guard counts money outside the company it asked the rule about - false alarms by construction" -ForegroundColor Red
    exit 1
}
if (([regex]::Matches($t, [regex]::Escape("await stage("))).Count -lt 6) {
    Write-Host "X the trap plants fewer than six shapes" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard measures dependency and impersonation; the trap plants six shapes" -ForegroundColor Green

# -- 6. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.933.ps1" -Raw
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
if ($self2 -notmatch [regex]::Escape("selftest-purchase-cost-masked-path.js")) {
    Write-Host "X the masked-path guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
# The snapshot is a mirror of the database, and this release adds eight
# functions to it. 932 lost a run to regenerating it by hand afterwards.
Write-Host "Refreshing the function snapshot from the live database..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X could not refresh supabase/schema/functions.sql" -ForegroundColor Red; exit 1 }

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.932.ps1" 2>$null

# -- 7. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.932.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the masked path refuses all six shapes (TEST database only)..." -ForegroundColor Cyan
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
git add -u -- "push_v3.74.932.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_933.txt"
    $msgLines = @(
        'feat(security): v3.74.933 - the authorised path for purchase prices is built first',
        '',
        'STAGE 1 OF 3, AND ITS EFFECT ON THE USER IS ZERO. Nothing reads the new',
        'path yet, no column is revoked, no screen changes. That order is the',
        '909 lesson taken literally: build the authorised path BEFORE removing',
        'the column, never after, or the screens break on users between two',
        'releases.',
        '',
        'THE OWNER DECIDED to hide the line price AND the document total',
        'together. The reason is arithmetic, not taste: a one-line purchase',
        'bill totalling 1000 for ten units states the purchase price by',
        'division. Hiding the line alone is a hide that looks complete and is',
        'not - worse than none, because whoever sees it trusts it.',
        '',
        'A MASKED VIEW, NOT A FUNCTION TO CALL - because the code was measured.',
        '909 hid the product cost behind product_costs(ids). Here, 21 read',
        'sites ask for select(*) across the six tables, and revoking a column',
        'would fail every one of them with a privilege error - including the',
        'accountant, who is allowed to see. A cure that breaks the accountant',
        'is not a cure. So each table gets a view with the SAME columns, in the',
        'SAME order, whose money comes from an authorised function instead of',
        'the table. Whoever may not see reads NULL - not an error, not a lying',
        'zero - and select(*) keeps working.',
        '',
        'THE VIEWS ARE security_invoker = true, so branch isolation still',
        'applies as if the user read the table himself. A view with its owner',
        'rights would have stepped over everything built from 917 to 932 in one',
        'stroke, silently, while working perfectly. And no view reads a money',
        'column from its table - so the views survive stage 3.',
        '',
        'ONE RULE, CALLED FROM TWO PLACES. The money function has to ask "may he',
        'see this document at all?", and being SECURITY DEFINER it does not get',
        'the row policy for free. Writing the condition again would give the',
        'rule two copies, and editing one would leave the other open in',
        'silence. So the head rule was extracted - can_access_bill,',
        'can_access_purchase_order - and the POLICY now calls it instead of',
        'stating it.',
        '',
        'PROVEN ROW BY ROW, not by counting: the old condition and the new',
        'function were compared for EVERY row and EVERY member, on test and on',
        'production before the switch - zero disagreements everywhere. Counts',
        'after the switch are identical to before.',
        '',
        'AND PROVEN BY IMPERSONATION ON PRODUCTION DATA. The company is in',
        'strict mode, so every role reads all its rows and zero money, except',
        'the purchasing officer who reads prices on 11 lines of orders HE wrote',
        '- and nothing else. Switching the company to restricted inside a',
        'rolled-back transaction, on the same rows in the same instant: the',
        'accountant, the manager and the purchasing officer read 5 totals, 9',
        'line prices and 6 order totals; the manufacturing officer, the',
        'salesman and the store keeper read zero. Only the role differed.',
        '',
        'A NEW LESSON, MEASURED WHILE WRITING THIS: ALTER DEFAULT PRIVILEGES on',
        'this database grants ALL privileges to authenticated on every new view.',
        'The first cut handed out INSERT, UPDATE, DELETE and TRUNCATE on all six',
        'views - seen in role_table_grants right after creation. Hence REVOKE',
        'ALL ... FROM PUBLIC, anon, authenticated BEFORE granting the read.',
        'Rule ten: granting what we want is not enough - revoke what we did not',
        'want first.',
        '',
        'AND THE GUARD PAID FOR ITS OWN LESSON BEFORE THE RELEASE SHIPPED. Its',
        'first run refused the CORRECT state: it claimed the salesman read the',
        'money of two bills he did not write. The guard was wrong, not the',
        'hide. One test user is staff in one company and purchasing officer in',
        'another; the rule was asked about the membership row company (no),',
        'then the money was counted across ALL companies - so the amounts of',
        'the company where he IS in the audience were counted against him.',
        'Measured by impersonation before changing a line: the real salesman',
        'reads his two bills and zero amounts. Rule eleven: the question and',
        'the measurement must fall on the same scope - a false alarm by',
        'construction is worse than none, because it teaches whoever reads it',
        'to stop believing the guard.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.933 pushed - the authorised path for purchase prices is built (stage 1 of 3)" -ForegroundColor Green
}
