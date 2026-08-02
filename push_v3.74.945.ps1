$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.945 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.944.ps1") { Remove-Item -LiteralPath "push_v3.74.944.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.945"') {
    Write-Host "+ 3.74.945" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.945]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.945]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$screen = "app/inventory/goods-receipt/page.tsx"
$route  = "app/api/bills/[id]/confirm-receipt/route.ts"
$mvg    = "scripts/check-purchase-money-direct-read.js"

$files = @("lib/version.ts", "CHANGELOG.md",
           $screen, $mvg,
           "push_v3.74.945.ps1")

$s = Get-Content -LiteralPath $screen -Raw
$r = Get-Content -LiteralPath $route  -Raw
$g = Get-Content -LiteralPath $mvg    -Raw

# ⚠️ THE CHECKS BELOW READ CODE, NOT COMMENTS - and this cost a run to learn.
# The screen's own header documents the defect it removed by quoting it:
#   `Number(it.unit_price || 0)`
# so a raw text search finds the false zero in the very comment that explains
# why it is gone, and refuses an honest release. A guard that cries wolf gets
# switched off. Measured: no "//" appears inside any string in this file, so
# stripping line and block comments is safe here.
$sCode = [regex]::Replace($s, '(?s)/\*.*?\*/', '')
$sCode = [regex]::Replace($sCode, '(?m)//.*$', '')
$rCode = [regex]::Replace($r, '(?s)/\*.*?\*/', '')
$rCode = [regex]::Replace($rCode, '(?m)//.*$', '')

# ===========================================================================
# 945 - THE PREMISE FIRST, BECAUSE THE PREMISE IS WHAT MAKES THIS SAFE.
#
# Masking a screen that AUTHORS a priced document corrupts data instead of
# hiding it: a masked read returns null, the browser computes zero, and a real
# document is posted at zero. That is why the purchase return had to wait for
# 941 (the server prices it) before 942 could mask it.
#
# The goods receipt is different, and the difference is MEASURED, not assumed:
# the confirm button sends ONE field, and the route reads ONE field. Every
# price and quantity is read by the server from the database itself. So the
# money on this screen is pure display - hiding it cannot spoil a document.
#
# That premise carries the whole release, so it is not left to anybody's
# memory. If someone adds priced line items to that request tomorrow - which
# would then be MASKED prices, i.e. null - this push refuses before the zero
# becomes a ledger entry.
# ===========================================================================
if ($sCode -notmatch [regex]::Escape('JSON.stringify({')) {
    Write-Host "X the receipt screen no longer posts a literal body - the premise cannot be read" -ForegroundColor Red
    exit 1
}
$bodyLiterals = @([regex]::Matches($sCode, 'JSON\.stringify\(\{([^}]*)\}\)') | ForEach-Object { $_.Groups[1].Value })
foreach ($lit in $bodyLiterals) {
    $fieldsSent = @([regex]::Matches($lit, '([A-Za-z_]\w*)\s*:') | ForEach-Object { $_.Groups[1].Value })
    foreach ($f in $fieldsSent) {
        # Measured today: ui_surface on confirm, plus the rejection reason on
        # reject. Nothing else, and nothing numeric. A NEW field has to be
        # argued for here, in this list, deliberately - which is the point.
        if ($f -ne "ui_surface" -and $f -ne "rejectionReason" -and $f -ne "rejection_reason") {
            Write-Host "X the receipt screen now sends '$f' to the server - the money on it is no longer pure display" -ForegroundColor Red
            Write-Host "  Masked reads return null. A priced field sent from here would post ZERO." -ForegroundColor Yellow
            exit 1
        }
    }
}
Write-Host "+ the receipt screen still sends no money - only the surface it was pressed on" -ForegroundColor Green

# And the other half of the same premise: the route must not START reading
# money from the request either, even if the screen is innocent today.
$bodyReads = @([regex]::Matches($rCode, 'body\s*\??\.\s*([A-Za-z_]\w*)') | ForEach-Object { $_.Groups[1].Value })
if ($bodyReads.Count -eq 0) {
    Write-Host "X confirm-receipt reads nothing from the body at all - the shape changed, re-measure" -ForegroundColor Red
    exit 1
}
foreach ($f in $bodyReads) {
    if ($f -ne "ui_surface") {
        Write-Host "X confirm-receipt now takes '$f' from the request body - it priced itself from the caller" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ confirm-receipt takes exactly one field from the request, and it is not money" -ForegroundColor Green

# -- and the screen itself reads through the masked path -------------------
foreach ($needle in @("bills_masked", "bill_items_masked")) {
    if ($sCode -notmatch [regex]::Escape($needle)) {
        Write-Host "X the receipt screen no longer reads $needle" -ForegroundColor Red; exit 1
    }
}
if ($sCode -match '\.from\(\s*"bills"\s*\)' -or $sCode -match '\.from\(\s*"bill_items"\s*\)') {
    Write-Host "X the receipt screen went back to the raw table" -ForegroundColor Red; exit 1
}
Write-Host "+ the receipt screen reads bills and bill_items through the masked views only" -ForegroundColor Green

# -- THE FALSE ZERO. This is the defect this release actually removes. -----
# `Number(x || 0)` turns a HIDDEN amount into a confident 0.00. That is worse
# than a leak: a leak is seen and disbelieved, a false number is believed and
# built upon. Measured before the release: the screen had exactly this shape on
# unit_price, and would have shown 0.00 to a store manager the moment the read
# was masked.
foreach ($shape in @("Number(it.unit_price || 0)",
                     "Number(bill.total_amount || 0)",
                     "Number(selectedBill.total_amount || 0)")) {
    if ($sCode -match [regex]::Escape($shape)) {
        Write-Host "X the false zero is back: $shape - a hidden amount would read as 0.00" -ForegroundColor Red
        exit 1
    }
}
foreach ($needle in @("isHiddenMoney", "money(", "sumOrHidden")) {
    if ($sCode -notmatch [regex]::Escape($needle)) {
        Write-Host "X the receipt screen no longer displays hidden money as a dash: $needle" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no false zero survives on the receipt screen - hidden money is a dash, and it says why" -ForegroundColor Green

# -- and the total is not summed short -------------------------------------
# A total missing a hidden line is a WRONG number that looks right. One hidden
# amount makes the whole total hidden.
if ($sCode -match 'reduce\([^)]*total_amount') {
    Write-Host "X the receipt total went back to reduce() - it would sum a hidden line as zero" -ForegroundColor Red
    exit 1
}
Write-Host "+ the total is hidden whole when any line is hidden - not silently summed short" -ForegroundColor Green

# -- the screen is in the guard's converted list, which only ever grows -----
if ($g -notmatch [regex]::Escape($screen)) {
    Write-Host "X $screen is not in the guard's converted list - it would not be watched" -ForegroundColor Red
    exit 1
}
$converted = ([regex]::Matches($g, '"app/[^"]+\.tsx?"')).Count
if ($converted -lt 12) {
    Write-Host "X the converted list shrank to $converted - it grows, it does not shrink" -ForegroundColor Red
    exit 1
}
Write-Host "+ $converted screens are on the converted list, and this one is among them" -ForegroundColor Green

# ===========================================================================
# CARRIED FORWARD - the ratchets from 938 through 944 do not loosen here.
# ===========================================================================
$attrs = ".gitattributes"
$at = Get-Content -LiteralPath $attrs -Raw
if ($at -notmatch [regex]::Escape("* text=auto eol=lf")) {
    Write-Host "X .gitattributes does not carry the one rule" -ForegroundColor Red; exit 1
}
# 944: a pattern with no slash matches the NAME IN ANY DIRECTORY, which is how
# `test-supplier.js` also caught scripts/test-supplier.js and kept it CRLF.
$unanchored = @([regex]::Matches($at, "(?m)^(?!/)(\S+)\s+-text\s*$") | ForEach-Object { $_.Groups[1].Value })
if ($unanchored.Count -gt 0) {
    Write-Host "X $($unanchored.Count) pinned pattern(s) are not anchored to the root:" -ForegroundColor Red
    foreach ($p in $unanchored) { Write-Host "    $p" -ForegroundColor Red }
    exit 1
}
$pinnedInAttrs = ([regex]::Matches($at, "(?m)^\S+\s+-text\s*$")).Count
if ($pinnedInAttrs -gt 14) {
    Write-Host "X the pinned UTF-16 list grew to $pinnedInAttrs - a debt list that grows is not a ratchet" -ForegroundColor Red
    exit 1
}
Write-Host "+ 943/944 hold: the rule is written down, every pin is anchored, and the list is $pinnedInAttrs of 14" -ForegroundColor Green

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
if ($g -notmatch [regex]::Escape("KNOWN_VIEW_EMBEDS") -or $g -notmatch [regex]::Escape("PGRST201")) {
    Write-Host "X the masked-view embed rule is gone - the 940 outage could return" -ForegroundColor Red; exit 1
}
$pinned = ([regex]::Matches($g, '"[a-z_]+_masked:[a-z_]+"')).Count
if ($pinned -gt 5) {
    Write-Host "X KNOWN_VIEW_EMBEDS grew to $pinned - a debt list that grows is not a ratchet" -ForegroundColor Red
    exit 1
}
Write-Host "+ 940 holds: both routes read the head alone, and the pinned embed list is $pinned of 5" -ForegroundColor Green

foreach ($scr in @("app/purchase-returns/page.tsx", "app/purchase-returns/[id]/page.tsx", "app/purchase-returns/new/page.tsx")) {
    $src = Get-Content -LiteralPath $scr -Raw
    if ($src -notmatch [regex]::Escape("_masked")) {
        Write-Host "X 942 loosened - $scr no longer reads a masked view" -ForegroundColor Red; exit 1
    }
}
$nsrc = Get-Content -LiteralPath "app/purchase-returns/new/page.tsx" -Raw
if ($nsrc -notmatch [regex]::Escape("fetchCanViewPurchaseCost")) {
    Write-Host "X 942 loosened - the authoring gate is gone from the new-return screen" -ForegroundColor Red; exit 1
}
Write-Host "+ 942 holds: the return screens read masked, and the authoring gate still asks" -ForegroundColor Green

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

$ap = Get-Content -LiteralPath "scripts/apply-migration-file.js" -Raw
if ($ap -notmatch [regex]::Escape("pg_get_functiondef")) {
    Write-Host "X the applier does not read back what it applied" -ForegroundColor Red; exit 1
}
Write-Host "+ migrations are applied from the file, and read back before being believed" -ForegroundColor Green

$ts = Get-Content -LiteralPath "tsconfig.json" -Raw
if ($ts -notmatch [regex]::Escape('"_wip_*"')) {
    Write-Host "X tsconfig no longer excludes _wip_*" -ForegroundColor Red; exit 1
}
Write-Host "+ scratch folders are outside the type-check graph" -ForegroundColor Green

$self2 = Get-Content -LiteralPath "push_v3.74.945.ps1" -Raw
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
                      "selftest-line-endings-are-one-way.js",
                      "selftest-purchase-return-priced-by-the-bill.js")) {
    if ($self2 -notmatch [regex]::Escape($needle)) {
        Write-Host "X the push battery no longer proves: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
# A TWO-STEP PROCEDURE THAT MUST BE DONE IN ORDER IS A TRAP, AND I BUILT ONE
# IN 941. The push applies its own migrations, from the file, and reads them
# back - and it does so FIRST, so a failure costs seconds, not the whole
# battery. Generic over whatever this release ships, which is nothing today,
# and the script says so rather than staying silent about a step that did not
# happen.
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

Write-Host "Proving the line-ending guard refuses all six shapes (throwaway repositories)..." -ForegroundColor Cyan
node scripts/selftest-line-endings-are-one-way.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the line-ending guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking line endings are still one way on THIS repository..." -ForegroundColor Cyan
node scripts/check-line-endings-are-one-way.js
if ($LASTEXITCODE -ne 0) { Write-Host "X a file is stored with CRLF again - modified would stop meaning modified" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.944.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_945.txt"
    $msgLines = @(
        'feat(purchase): v3.74.945 - the goods receipt reads its money through the masked view',
        '',
        'Stage 2, batch 5. Twelve screens converted; the counted remainder falls from',
        '112 direct reads to 108.',
        '',
        'WHY THIS SCREEN NEEDED NO MIGRATION FIRST - MEASURED, NOT ASSUMED.',
        '',
        'The purchase return had to wait for 941 before 942 could mask it, because its',
        'creation screen PRICED the document from a read: mask it first and the browser',
        'computes zero, and a real document gets posted at zero. The goods receipt is',
        'not that. The confirm button sends one field:',
        '',
        '    body: JSON.stringify({ ui_surface: "goods_receipt_page" })',
        '',
        'and the route takes one field back out of it - two occurrences, no others.',
        'Every price and quantity is read by the server from the database itself. So',
        'the money on this screen is pure display, and hiding it cannot spoil anything.',
        '',
        'That premise carries the whole release, so it is not left to memory: this push',
        'refuses if the screen ever sends a priced field, or if confirm-receipt ever',
        'reads anything but ui_surface from the request. A priced field sent from here',
        'would be a MASKED price - null - and would post as zero.',
        '',
        'AND A DEFECT THAT WAS ALREADY THERE, WHICH MASKING ALONE WOULD HAVE WEAPONISED.',
        '',
        '    unit_price: Number(it.unit_price || 0)',
        '',
        'Number(null || 0) is zero. Mask the read without removing this and a store',
        'manager sees 0.00 where a price exists - worse than a leak, because a leak is',
        'seen and disbelieved while a false number is believed and built upon. Hidden',
        'money now stays null and shows as a dash with the reason, in all three places,',
        'and the list total is hidden WHOLE when any line is hidden rather than summed',
        'short.',
        '',
        'No embed sits on a masked view: the four embeds became second queries that',
        'rebuild the same response keys, because the history search reads',
        'bill.suppliers?.name and a changed shape would fail silently.',
        '',
        'subtotal and tax_amount were dropped from both selects - measured as never',
        'displayed and never computed with. What is not read cannot leak.'
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
if ($headSubject -notmatch [regex]::Escape("v3.74.945")) {
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
Write-Host "`n+ v3.74.945 pushed - the goods receipt shows a dash, never a false zero" -ForegroundColor Green
Write-Host "  HEAD = origin/main = $localHead" -ForegroundColor DarkGray
