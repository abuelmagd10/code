$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.942 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.941.ps1") { Remove-Item -LiteralPath "push_v3.74.941.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.942"') {
    Write-Host "+ 3.74.942" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.942]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.942]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$listScreen   = "app/purchase-returns/page.tsx"
$detailScreen = "app/purchase-returns/[id]/page.tsx"
$newScreen    = "app/purchase-returns/new/page.tsx"
$guard        = "scripts/check-purchase-money-direct-read.js"
$applier      = "scripts/apply-migration-file.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $listScreen, $detailScreen, $newScreen, $guard,
           "push_v3.74.942.ps1")

# -LiteralPath: the detail screen's path contains [id], and square brackets are
# wildcards to PowerShell's provider. (858 lesson, and it bites here for real.)
$ls = Get-Content -LiteralPath $listScreen   -Raw
$ds = Get-Content -LiteralPath $detailScreen -Raw
$ns = Get-Content -LiteralPath $newScreen    -Raw
$g  = Get-Content -LiteralPath $guard        -Raw

# ===========================================================================
# 942 - THE THREE PURCHASE-RETURN SCREENS. They come AFTER 941 and not before:
# masking the new-return screen while the browser still priced the document
# would have CORRUPTED data rather than hidden it - a masked read returns null,
# the screen computes zero, and a zero-valued return gets posted. Now that the
# server prices from the bill and refuses any disagreeing number, the forty-nine
# compute sites are display only, and masking is free.
# ===========================================================================

# -- 1. all three read through the masked path, and none reads a table --------
foreach ($pair in @(@{n="list"; s=$ls}, @{n="detail"; s=$ds}, @{n="new"; s=$ns})) {
    if ($pair.s -notmatch [regex]::Escape("_masked")) {
        Write-Host "X the $($pair.n) screen reads no masked view at all" -ForegroundColor Red; exit 1
    }
    foreach ($raw in @("from('purchase_returns')", 'from("purchase_returns")',
                       "from('purchase_return_items')", 'from("purchase_return_items")',
                       "from('bills')", 'from("bills")',
                       "from('bill_items')", 'from("bill_items")')) {
        if ($pair.s -match [regex]::Escape($raw)) {
            Write-Host "X the $($pair.n) screen reads a money table directly: $raw" -ForegroundColor Red; exit 1
        }
    }
}
Write-Host "+ the three screens read purchase money through the masked path only" -ForegroundColor Green

# -- 2. and the guard KNOWS them - converted in the same release -------------
# 936 shipped a screen converted in the file and raw at its /api source. A
# conversion the guard does not know about is a conversion that can be undone
# without a sound.
foreach ($p in @("app/purchase-returns/page.tsx",
                 "app/purchase-returns/[id]/page.tsx",
                 "app/purchase-returns/new/page.tsx")) {
    if ($g -notmatch [regex]::Escape($p)) {
        Write-Host "X the guard does not know $p was converted" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the guard was taught the three screens in the same release that converted them" -ForegroundColor Green

# -- 3. the cost gate: asked at the door AND at both writes ------------------
# A purchase return is a document VALUED AT the purchase cost of the bill it
# returns. Whoever may not see that cost may not author one. And the question
# is put to the DATABASE, never to a role list in the screen (934).
if ($ns -notmatch [regex]::Escape("fetchCanViewPurchaseCost")) {
    Write-Host "X the new-return screen never asks whether the user may see purchase cost" -ForegroundColor Red
    exit 1
}
$gateHits = ([regex]::Matches($ns, [regex]::Escape('costGate !== "allowed"'))).Count
if ($gateHits -lt 2) {
    Write-Host "X the gate guards $gateHits write path(s) - both saveReturn and saveMultiWarehouseReturn must ask" -ForegroundColor Red
    exit 1
}
if ($ns -notmatch [regex]::Escape('costGate === "blocked"')) {
    Write-Host "X a blocked user would meet a form he cannot submit instead of a reason" -ForegroundColor Red
    exit 1
}
Write-Host "+ the gate is asked at the door and on both write paths, and it says why ($gateHits write path(s))" -ForegroundColor Green

# -- 4. the SECOND HOME for the cost rule is gone ---------------------------
# The amount column used to be dropped by a local role list - and that list had
# already DRIFTED: it hid the amount from the accountant, who IS in the cost
# audience by the rule (906, 914). Over-hiding, not leaking - milder, and it
# proves the same point: a rule in two places diverges, and the direction it
# diverges in is not under anyone's control.
if ($ls -match [regex]::Escape("!isRestrictedRole ? [{")) {
    Write-Host "X the amount column is decided by a local role list again" -ForegroundColor Red; exit 1
}
if ($ls -notmatch [regex]::Escape("isHiddenMoney")) {
    Write-Host "X the list screen no longer distinguishes a hidden amount from a real zero" -ForegroundColor Red
    exit 1
}
Write-Host "+ the amount column asks the database, not a role list the screen keeps" -ForegroundColor Green

# -- 5. what is not read cannot leak ----------------------------------------
# purchase_return_warehouse_allocations.total_amount is purchase money in an
# unmasked side table. Measured: this screen never displays it and never
# computes with it - so it was removed from the select rather than masked.
if ($ls -match [regex]::Escape("confirmed_at, total_amount")) {
    Write-Host "X the list reads the allocation's total_amount again - unmasked purchase money it never shows" -ForegroundColor Red
    exit 1
}
Write-Host "+ the allocation's unmasked amount is not read at all - what is not read cannot leak" -ForegroundColor Green

# -- 6. and the applier stays honest (941) ----------------------------------
$ap = Get-Content -LiteralPath $applier -Raw
if ($ap -notmatch [regex]::Escape("pg_get_functiondef")) {
    Write-Host "X the applier does not read back what it applied" -ForegroundColor Red; exit 1
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

# 941 does not loosen: the browser must not price the return again.
$m941 = Get-Content -LiteralPath "supabase/migrations/20260802000002_v3_74_941_the_server_prices_the_return.sql" -Raw
$m941Code = ($m941 -split "`n" | Where-Object { $_.TrimStart() -notmatch '^--' }) -join "`n"
foreach ($shape in @("COALESCE((v_item->>'unit_price')", "COALESCE((v_item->>'line_total')",
                     "COALESCE((p_purchase_return->>'total_amount')", "p_bill_update->>'total_amount'")) {
    if ($m941Code -match [regex]::Escape($shape)) {
        Write-Host "X 941 loosened - the request prices the return again: $shape" -ForegroundColor Red; exit 1
    }
}
if ($m941 -notmatch [regex]::Escape("purchase_return_priced_line")) {
    Write-Host "X the pricing rule lost its single home" -ForegroundColor Red; exit 1
}
Write-Host "+ 941 holds: the server still prices the purchase return, the browser is not asked" -ForegroundColor Green

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

$self2 = Get-Content -LiteralPath "push_v3.74.942.ps1" -Raw
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
git add -u -- "push_v3.74.941.ps1" 2>$null

$expected = @($files) + @("push_v3.74.941.ps1")
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
# The apply step is GENERIC now, not tied to one named file: it applies every
# migration this release ships, whatever they are. 941 taught this the hard way
# - a step that must be REMEMBERED is not a step, it is a defect waiting for a
# tired evening. This release ships none, and the script says so rather than
# staying silent about a step that did not happen.
$releaseMigrations = @($files | Where-Object { $_ -like "supabase/migrations/*.sql" })
if ($releaseMigrations.Count -eq 0) {
    Write-Host "+ this release ships no migration - nothing to apply" -ForegroundColor Green
} else {
    foreach ($mf in $releaseMigrations) {
        Write-Host "Applying $mf from the file, and reading it back..." -ForegroundColor Cyan
        node scripts/apply-migration-file.js $mf --test --production
        if ($LASTEXITCODE -ne 0) {
            Write-Host "X the migration did not apply, or what runs differs from the file - NOT pushing" -ForegroundColor Red
            exit 1
        }
    }
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
git add -u -- "push_v3.74.941.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_942.txt"
    $msgLines = @(
        'feat(security): v3.74.942 - the purchase-return screens read their money through the masked path',
        '',
        'STAGE 2, BATCH 4: the three purchase-return screens - list, detail and new.',
        'Measured debt drops from 120 direct reads to 112, counted out loud as always.',
        '',
        'WHY THIS COMES AFTER 941 AND NOT BEFORE. Masking the new-return screen while',
        'the browser still priced the document would have CORRUPTED data rather than',
        'hidden it: a masked read returns null, the screen computes zero, and a',
        'zero-valued return gets posted to a real ledger. Now that the server prices',
        'from the bill and refuses any disagreeing number, the forty-nine compute sites',
        'in purchase-returns/new are DISPLAY ONLY, and masking costs nothing.',
        '',
        'THE AUTHORING GATE, AND ITS IMPACT MEASURED BEFORE IT WAS WRITTEN. A purchase',
        'return is a document VALUED AT the purchase cost of the bill it returns. So',
        'whoever may not see that cost may not author one - not because the screen would',
        'show him numbers, but because a document whose author cannot see its value is a',
        'document signed blind. Who may create one by RLS: owner, admin, manager,',
        'accountant. The cost audience (906, 914) holds all of them EXCEPT admin - and',
        'ZERO members hold the admin role in any company. So the gate takes nothing from',
        'anyone who exists today, and shuts the door before it is opened. That settles',
        'debt item 12 in the right direction: do not widen the cost audience to include',
        'admin - stop admin from authoring a document he cannot see the value of.',
        '',
        'The gate is asked THREE times: at the door before a single number is read, and',
        'on each of the two write paths - because browser state can be changed, and the',
        'decision belongs at the moment of writing. And it is put to the DATABASE, never',
        'to a role list the screen keeps (934). A blocked user meets an amber panel that',
        'explains what a purchase return is valued at and who can create one - not a',
        'silent redirect, which reads as a broken system.',
        '',
        'AND A SECOND HOME FOR THE COST RULE WAS FOUND HERE - ALREADY DRIFTED. The',
        'amount column was dropped by a local role list: isRestrictedRole = store',
        'manager OR ACCOUNTANT. But the accountant IS in the cost audience by the rule.',
        'The screen was hiding a number he is entitled to. Over-hiding, not leaking -',
        'milder, and it proves the same point: a rule kept in two places diverges, and',
        'and nobody chooses the direction it diverges in. The column now shows for',
        'everyone and the DATABASE answers: a masked null renders as an em dash with the',
        'reason attached. isRestrictedRole stays where its meaning is true - which',
        'quantity is mine - and nowhere else.',
        '',
        'WHAT IS NOT READ CANNOT LEAK. purchase_return_warehouse_allocations.total_amount',
        'is purchase money in an unmasked side table, and the list was reading it.',
        'Measured: the screen never displays it and never computes with it - it uses only',
        'the id, the warehouse and the status. So it was removed from the select rather',
        'than masked. The column remains recorded debt; this screen is no longer a door',
        'to it.',
        '',
        'NO EMBED ON A MASKED VIEW. All three screens embedded supplier, bill, branch,',
        'warehouse, products, allocations and items in one query. Left on top of the',
        'masked views that would reproduce the 940 outage (PGRST201 empties the screen).',
        'Heads and lines are read alone and the names are stitched in a second query',
        'under the same response keys. Zero new embeds; the pinned list stays at five.',
        '',
        'And the bill NUMBER is read from bills_masked too, not from bills - one door,',
        'not two, even for a column that is not money. The guard caught that on me: I',
        'read bills for bill_number and it refused, correctly.'
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
if ($headSubject -notmatch [regex]::Escape("v3.74.942")) {
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
Write-Host "`n+ v3.74.942 pushed - the server prices the purchase return, the browser is not asked" -ForegroundColor Green
Write-Host "  HEAD = origin/main = $localHead" -ForegroundColor DarkGray
