$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.941 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.940.ps1") { Remove-Item -LiteralPath "push_v3.74.940.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.941"') {
    Write-Host "+ 3.74.941" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.941]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.941]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260802000002_v3_74_941_the_server_prices_the_return.sql"
$guard     = "scripts/check-purchase-return-priced-by-the-bill.js"
$trap      = "scripts/selftest-purchase-return-priced-by-the-bill.js"

$applier   = "scripts/apply-migration-file.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $guard, $trap, $applier,
           "push_v3.74.941.ps1")

$m = Get-Content -LiteralPath $migration -Raw
$g = Get-Content -LiteralPath $guard     -Raw
$t = Get-Content -LiteralPath $trap      -Raw

# The migration QUOTES the old broken shapes in its header, so that whoever
# reads it in a year sees what was wrong. A check that greps the raw file would
# then refuse the very release that fixes them. So the payload-money check below
# runs on the CODE, with comment lines removed - the 936 lesson, in SQL.
$mCode = ($m -split "`n" | Where-Object { $_.TrimStart() -notmatch '^--' }) -join "`n"

# ===========================================================================
# 941 - THE BROWSER PRICED THE PURCHASE RETURN. Measured, not inferred: the
# only two purchase returns on production sit on the SAME bill, the SAME line,
# the SAME quantity and the SAME discount - and carry DIFFERENT values (0.90
# and 0.77). One was born under the pre-515 formula, the other after it. The
# number was never derived from anything; it was whatever the screen computed
# at that moment. And COALESCE(...,0) turned a MISSING price into zero in
# silence, which is worse than refusing.
# ===========================================================================

# -- 1. no writer takes money from the request any more -------------------
foreach ($shape in @("COALESCE((v_item->>'unit_price')",
                     "COALESCE((v_item->>'line_total')",
                     "COALESCE((p_purchase_return->>'total_amount')",
                     "COALESCE((p_purchase_return->>'subtotal')",
                     "COALESCE((v_group->>'total_amount')",
                     "p_bill_update->>'total_amount'")) {
    if ($mCode -match [regex]::Escape($shape)) {
        Write-Host "X the migration still takes money from the request: $shape" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no money is read from the request - not the line, not the header, not the bill total" -ForegroundColor Green

# -- 2. the pricing rule has ONE home, and all three writers call it ------
# Three functions repeated the formula and three places in the screen repeated
# it, and they drifted. The rule is written once now.
if ($m -notmatch [regex]::Escape("CREATE OR REPLACE FUNCTION public.purchase_return_priced_line")) {
    Write-Host "X there is no single home for how a return line is priced" -ForegroundColor Red; exit 1
}
$calls = ([regex]::Matches($m, [regex]::Escape("public.purchase_return_priced_line("))).Count
if ($calls -lt 7) {
    Write-Host "X the pricing home is called $calls time(s) - a writer prices on its own again" -ForegroundColor Red
    exit 1
}
Write-Host "+ the pricing rule has one home, called from every writer ($calls call sites)" -ForegroundColor Green

# -- 3. and a disagreeing number is REFUSED, naming both --------------------
# The owner's ruling (2 August): refuse and say why. "Rejected" with no numbers
# fixes no screen and exposes no tampering.
if ($m -notmatch [regex]::Escape("CREATE OR REPLACE FUNCTION public.assert_purchase_return_amount")) {
    Write-Host "X a disagreeing amount is not refused at all" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("يخالف المحسوبَ من الفاتورة")) {
    Write-Host "X the refusal does not carry the sent value and the bill's value" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("الغيابُ خطأٌ لا صفر")) {
    Write-Host "X a missing price would silently become zero again" -ForegroundColor Red; exit 1
}
Write-Host "+ a disagreeing amount is refused by name and number, and a missing price is an error not a zero" -ForegroundColor Green

# -- 4. the full-rights writers all pin their search_path ------------------
# resubmit_purchase_return was SECURITY DEFINER with no search_path.
$definer = ([regex]::Matches($m, [regex]::Escape("SECURITY DEFINER"))).Count
$paths   = ([regex]::Matches($m, [regex]::Escape("SET search_path TO 'public', 'pg_catalog'"))).Count
if ($paths -lt $definer) {
    Write-Host "X $definer SECURITY DEFINER function(s) but only $paths pinned search_path(s)" -ForegroundColor Red
    exit 1
}
Write-Host "+ every SECURITY DEFINER writer pins its search_path ($definer definer(s), $paths pinned)" -ForegroundColor Green

# -- 5. the pricing home is not handed to an end user ---------------------
foreach ($fn in @("purchase_return_bill_discount_ratio(uuid)",
                  "purchase_return_priced_line(uuid, uuid, numeric)",
                  "assert_purchase_return_amount(text, numeric, numeric, numeric, text)")) {
    if ($m -notmatch [regex]::Escape("REVOKE ALL ON FUNCTION public.$fn FROM PUBLIC, anon, authenticated")) {
        Write-Host "X $fn is not revoked from end users" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the pricing rule is called from inside, never by a caller" -ForegroundColor Green

# -- 6. the guard measures the EFFECT: it plants a return and looks --------
if ($g -notmatch [regex]::Escape("process_purchase_return_atomic")) {
    Write-Host "X the guard reads text instead of planting a real purchase return" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("ROLLBACK")) {
    Write-Host "X the guard would leave its probes behind" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("the innocent is spared")) {
    Write-Host "X the guard never checks that what the CURRENT screen sends still works" -ForegroundColor Red
    exit 1
}
if ($g -notmatch [regex]::Escape("PINNED_LINE_TOTAL_DRIFT")) {
    Write-Host "X the explained legacy divergence is not pinned - it would be forgiven silently" -ForegroundColor Red
    exit 1
}
foreach ($needle in @("the writer takes unit_price from the request again",
                      "the refusal is emptied out",
                      "anon granted execute on the pricing home",
                      "resubmit loses its search_path",
                      "the pricing home drifts away from what the screen sends")) {
    if ($t -notmatch [regex]::Escape($needle)) {
        Write-Host "X the trap no longer plants: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the guard plants a real return and looks, and the trap plants all five shapes" -ForegroundColor Green

# -- 7. the migration is APPLIED FROM THE FILE, never retyped into the DB --
# I made this mistake in this very release: I applied the six functions by hand
# through the dashboard, and the file on disk carried inner comments I did not
# carry with them. All six fingerprints diverged, and check-migration-matches-db
# would have refused the push - rightly. The cure is not to strip the file until
# it agrees with the database; it is to apply THE FILE.
$ap = Get-Content -LiteralPath $applier -Raw
if ($ap -notmatch [regex]::Escape("pg_get_functiondef")) {
    Write-Host "X the applier does not read back what it applied - an exit code is not a measurement" -ForegroundColor Red
    exit 1
}
if ($ap -notmatch [regex]::Escape("name a target explicitly")) {
    Write-Host "X the applier could touch production without being told to" -ForegroundColor Red; exit 1
}
Write-Host "+ migrations are applied from the file, and read back before being believed" -ForegroundColor Green

# ===========================================================================
# CARRIED FORWARD - the ratchets from 938, 939 and 940 do not loosen here.
# ===========================================================================
$bills = Get-Content -LiteralPath "app/api/v2/bills/route.ts" -Raw
$po    = Get-Content -LiteralPath "app/api/v2/purchase-orders/route.ts" -Raw
if ($bills -notmatch '(?s)const BILL_SELECT = `(.*?)`') {
    Write-Host "X BILL_SELECT is gone - the bills route no longer names its columns" -ForegroundColor Red; exit 1
}
if ($Matches[1] -match '\(') {
    Write-Host "X BILL_SELECT embeds another table again - PGRST201 would empty the list a second time" -ForegroundColor Red
    exit 1
}
if ($po -notmatch '(?s)const PO_SELECT = `(.*?)`') {
    Write-Host "X PO_SELECT is gone" -ForegroundColor Red; exit 1
}
if ($Matches[1] -match '\(') {
    Write-Host "X PO_SELECT embeds another table again - the same outage, one release later" -ForegroundColor Red
    exit 1
}
foreach ($needle in @("r.suppliers = r.supplier_id", "r.goods_receipts = r.goods_receipt_id", "data: rows")) {
    if ($bills -notmatch [regex]::Escape($needle)) {
        Write-Host "X the bills route no longer stitches: $needle" -ForegroundColor Red; exit 1
    }
}
$mvg = Get-Content -LiteralPath "scripts/check-purchase-money-direct-read.js" -Raw
if ($mvg -notmatch [regex]::Escape("KNOWN_VIEW_EMBEDS") -or $mvg -notmatch [regex]::Escape("PGRST201")) {
    Write-Host "X the masked-view embed rule is gone - the 940 outage could return" -ForegroundColor Red; exit 1
}
$pinned = ([regex]::Matches($mvg, '"[a-z_]+_masked:[a-z_]+"')).Count
if ($pinned -gt 5) {
    Write-Host "X KNOWN_VIEW_EMBEDS grew to $pinned - a debt list that grows is not a ratchet" -ForegroundColor Red
    exit 1
}
Write-Host "+ 940 holds: both routes read the head alone, and the pinned embed list is $pinned of 5" -ForegroundColor Green

$m939 = Get-Content -LiteralPath "supabase/migrations/20260802000001_v3_74_939_notifications_reach_a_person.sql" -Raw
foreach ($needle in @("BEFORE INSERT ON public.notifications", "company_role_has_holder",
                      "workflow_row_is_open", "unverified_count", "ELSE TRUE")) {
    if ($m939 -notmatch [regex]::Escape($needle)) {
        Write-Host "X 939 loosened: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ 939 holds: the routing rule still sits on the table, the alarm still names what it cannot verify" -ForegroundColor Green

foreach ($dbgf in @("scripts/check-purchase-return-priced-by-the-bill.js",
                    "scripts/check-notifications-reach-a-person.js",
                    "scripts/check-purchase-cost-masked-path.js",
                    "scripts/check-product-management-one-door.js")) {
    $gsrc = Get-Content -LiteralPath $dbgf -Raw
    if ($gsrc -notmatch [regex]::Escape("client.on(")) {
        Write-Host "X $dbgf has no error listener - a dropped socket would kill it" -ForegroundColor Red; exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("TRANSIENT")) {
        Write-Host "X $dbgf does not retry a transient drop" -ForegroundColor Red; exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("problems.length = 0")) {
        Write-Host "X $dbgf would carry half a measurement into its retry" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the database guards survive a dropped connection, and retry from a clean slate" -ForegroundColor Green

$ts = Get-Content -LiteralPath "tsconfig.json" -Raw
if ($ts -notmatch [regex]::Escape('"_wip_*"')) {
    Write-Host "X tsconfig no longer excludes _wip_*" -ForegroundColor Red; exit 1
}
Write-Host "+ scratch folders are outside the type-check graph" -ForegroundColor Green

$self2 = Get-Content -LiteralPath "push_v3.74.941.ps1" -Raw
foreach ($needle in @("check-je-default-status.js --prove --require-db",
                      "check-anon-open-tables.js --prove --require-db",
                      "selftest-products-branch-policy.js",
                      "selftest-branch-isolation-holes.js",
                      "selftest-transfer-journal.js",
                      "selftest-purchase-cost-masked-path.js",
                      "selftest-cost-rule-has-one-home.js",
                      "selftest-product-management-one-door.js",
                      "selftest-purchase-money-direct-read.js",
                      "selftest-notifications-reach-a-person.js",
                      "selftest-purchase-return-priced-by-the-bill.js")) {
    if ($self2 -notmatch [regex]::Escape($needle)) {
        Write-Host "X the push battery no longer proves: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.940.ps1" 2>$null

$expected = @($files) + @("push_v3.74.940.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

# ---------------------------------------------------------------------------
# A TWO-STEP PROCEDURE THAT MUST BE DONE IN ORDER IS A TRAP, AND I BUILT ONE.
# This release's migration had to be applied before the push, by hand, in a
# separate command. It was missed twice, and both times the battery ran to the
# very end before refusing. A step that must be remembered is not a step: it is
# a defect waiting for a tired evening. So the push applies its OWN migration,
# from the file, and reads it back - and it does so FIRST, so a failure costs
# seconds instead of the whole battery.
Write-Host "Applying this release's migration from the file, and reading it back..." -ForegroundColor Cyan
node scripts/apply-migration-file.js $migration --test --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the migration did not apply, or what runs differs from the file - NOT pushing" -ForegroundColor Red
    exit 1
}

Write-Host "Proving the pricing guard refuses all five shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-purchase-return-priced-by-the-bill.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the pricing guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring how a purchase return is priced, by planting one on the live database..." -ForegroundColor Cyan
node scripts/check-purchase-return-priced-by-the-bill.js --require-db --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a purchase return can still be priced by whoever sends the request" -ForegroundColor Red; exit 1 }

Write-Host "Proving the direct-read guard refuses on all fifteen shapes, and spares the innocent..." -ForegroundColor Cyan
node scripts/selftest-purchase-money-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the direct-read guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no screen or /api source reads money raw - and no embed sits on a masked view..." -ForegroundColor Cyan
node scripts/check-purchase-money-direct-read.js --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a converted screen reads raw, or a new embed sits on a masked view" -ForegroundColor Red; exit 1 }

Write-Host "Proving the routing guard refuses all five shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-notifications-reach-a-person.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the routing guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring where a notification actually lands, by planting one on the live database..." -ForegroundColor Cyan
node scripts/check-notifications-reach-a-person.js --require-db --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a notification can still be sent where nobody will read it" -ForegroundColor Red; exit 1 }

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

Write-Host "Measuring the masked path by impersonation - and counting every pinned embed's relationships..." -ForegroundColor Cyan
node scripts/check-purchase-cost-masked-path.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the masked path is not what the code assumes, or a pinned embed turned ambiguous" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.940.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_941.txt"
    $msgLines = @(
        'fix(security): v3.74.941 - the server prices the purchase return, the browser is not asked',
        '',
        'A LIVE FINANCIAL-INTEGRITY HOLE, unrelated to the cost-hiding programme:',
        'anyone who could create a purchase return could price it at whatever they',
        'liked, and the ledger, the supplier balance and the inventory credit all',
        'followed the browser.',
        '',
        'FOUND BY MEASUREMENT, NOT BY READING. process_purchase_return_atomic locks',
        'the bill_items row in its hands (FOR UPDATE) and then asks it about the',
        'QUANTITY ONLY. The price came from the request:',
        '',
        "  COALESCE((v_item->>'unit_price')::NUMERIC, 0)",
        "  COALESCE((v_item->>'line_total')::NUMERIC, 0)",
        "  COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0)",
        "  total_amount = (p_bill_update->>'total_amount')::NUMERIC   -- the BILL itself",
        '',
        'And the proof came from the data, not the code: the only two purchase',
        'returns on production sit on the SAME bill, the SAME line, the SAME quantity',
        'and the SAME discount - and carry DIFFERENT values. PRET-5689 is 0.90 (the',
        'pre-515 formula, before the document discount ratio existed) and PRET-79328',
        'is 0.77 (after it). Two documents for the same goods, 15% apart, because each',
        'was born in a different browser build. The number was never derived from',
        'anything. And COALESCE(...,0) turned a MISSING price into zero IN SILENCE -',
        'a zero-valued return posted instead of a refusal.',
        '',
        'THE CURE IS TO REMOVE THE AUTHORITY, NOT TO ADD A CHECK ON TOP OF IT. One',
        'home for pricing - purchase_return_priced_line - called by all three writers,',
        'so the rule cannot drift into three versions the way it already had. Price,',
        'tax rate and discount come from THE BILL LINE THE RETURN RETURNS; line_total',
        'is derived; the header is computed from the lines that were actually written.',
        'The document discount ratio is computed from bills.subtotal over the sum of',
        'bill_items.line_total instead of being sent - rounded to six places exactly as',
        'the screen did, so no difference arises from rounding alone.',
        '',
        'AND IT REFUSES OUT LOUD (the owner ruled on this, 2 August). Any disagreement',
        'means either a screen computing wrongly or someone tampering, and both deserve',
        'to be seen. Every refusal carries WHAT WAS SENT and WHAT THE BILL SAYS, the',
        'field name, and the bill item id - diagnosable in a second, not an hour.',
        '',
        'THREE MORE CLOSED ALONG THE WAY: the vendor credit took its totals from the',
        'browser too and could disagree with the return it was born from - it is copied',
        'from it now. resubmit_purchase_return deleted the lines and rewrote them at',
        'sent prices, so a return rejected on one price could come back at another -',
        'and it was SECURITY DEFINER WITH NO search_path, now pinned. And the path that',
        'let the request rewrite bills.total_amount is gone; measured, the screen never',
        'reaches it (the return bill list is restricted to receipt_status = received,',
        'which is exactly what makes isFinalizedBill always true), so it was alive only',
        'in the API - that is, only for a crafted request.',
        '',
        'PROVEN LIVE ON PRODUCTION, ROLLED BACK: a forged price of 0.01 is refused',
        'naming 0.01 and 1.00; the PRET-5689 formula (0.90 vs 0.77) is refused; and',
        'WHAT THE CURRENT SCREEN SENDS IS ACCEPTED, writing 0.77/0.11/0.88 - the guard',
        'refuses the wrong and spares the innocent. Zero probe rows remained. The six',
        'function fingerprints (md5) are identical on production and test.',
        '',
        'NO DATA WAS REPAIRED: zero price divergence between every existing return line',
        'and its bill line. The door was open and never walked through. The single',
        'line_total divergence - PRET-5689 - is pinned BY NAME in the guard: explained,',
        'not forgiven, and its count may not grow.',
        '',
        'The trap plants five shapes, the nastiest being an EMPTIED refusal function',
        'that leaves every name in place so the text still reads perfectly - and a',
        'fifth where the pricing rule drifts away from the screen, because a guard that',
        'refuses the innocent is a defect, not protection.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)

    # v3.74.939 - a stale index.lock appeared DURING the battery, the commit
    # failed, `git push` said "Everything up-to-date" and the banner declared
    # success. THE SCRIPT LIED ABOUT ITS OWN RELEASE. Deleting the lock at the
    # top is not enough: it has to be gone at the moment of the commit.
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
$headSubject = git log -1 --format=%s
if ($headSubject -notmatch [regex]::Escape("v3.74.941")) {
    Write-Host "X HEAD is not this release ($headSubject) - refusing to claim a push" -ForegroundColor Red
    exit 1
}
Write-Host "+ the commit is on HEAD: $headSubject" -ForegroundColor Green

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { Write-Host "X git push failed" -ForegroundColor Red; exit 1 }

# -- and neither is the push: the remote is READ BACK -------------------
$localHead  = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse origin/main).Trim()
if ($localHead -ne $remoteHead) {
    Write-Host "X origin/main is $remoteHead but HEAD is $localHead - the push did NOT land" -ForegroundColor Red
    exit 1
}
Write-Host "`n+ v3.74.941 pushed - the server prices the purchase return, the browser is not asked" -ForegroundColor Green
Write-Host "  HEAD = origin/main = $localHead" -ForegroundColor DarkGray
