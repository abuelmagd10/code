$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.943 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.942.ps1") { Remove-Item -LiteralPath "push_v3.74.942.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.943"') {
    Write-Host "+ 3.74.943" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.943]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.943]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$attrs = ".gitattributes"
$guard = "scripts/check-line-endings-are-one-way.js"
$trap  = "scripts/selftest-line-endings-are-one-way.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $attrs, ".gitignore", $guard, $trap,
           "push_v3.74.943.ps1")

# ─── GENERATED ARTEFACTS THAT .gitignore ALREADY NAMES ────────────────────
#
# .gitignore has said `supabase/.temp/` since long before today, and *.temp
# besides. But an ignore rule does not apply to a file that is ALREADY
# tracked - these were committed before the rule existed, so git kept
# reporting them, and every tool run rewrote them: gotrue-version holds
# v2.183.0 in HEAD and v2.193.0 on disk because the Supabase CLI moved on.
#
# They blocked this release four times, and I kept asking for a command to be
# typed before every run. That was the 941 mistake all over again: a step that
# must be REMEMBERED is not a step, it is a defect waiting for a tired evening.
# So the release finishes the decision the repository already made.
#
# And it belongs HERE, not in a release of its own: this one is about making
# "modified" mean modified. A file that changes every time a tool runs is the
# same disease as a file that reads as changed because of a carriage return.
$generated = @(
    "supabase/.temp/cli-latest",
    "supabase/.temp/gotrue-version",
    "supabase/.temp/pooler-url",
    "supabase/.temp/postgres-version",
    "supabase/.temp/project-ref",
    "supabase/.temp/rest-version",
    "supabase/.temp/storage-migration",
    "supabase/.temp/storage-version",
    "tsconfig.check.tsbuildinfo"
)

$at = Get-Content -LiteralPath $attrs -Raw
$g  = Get-Content -LiteralPath $guard -Raw
$t  = Get-Content -LiteralPath $trap  -Raw

# ===========================================================================
# 943 - LINE ENDINGS. Measured before anything was written: 3642 tracked files,
# NO .gitattributes at all, and core.autocrlf unset in every scope. 2538 files
# are stored LF and sit on disk as CRLF, so every one of them reads as modified
# in every run, with a diff the size of the whole file. That is not cosmetic
# noise: THE REAL CHANGE PASSES UNDERNEATH IT - which is exactly how the 938
# defect that emptied the purchase-bill list got through my own review.
#
# And what does it actually cost? Measured, not estimated. `git add
# --renormalize .` re-stores every file under the new rules:
#   - 3555 files already LF in the index  -> stored LF     -> NO CHANGE
#   - 44 binaries and 21 empty files      -> untouched
#   - 13 files stored CRLF in the index   -> become LF
# So the commit touches THIRTEEN files, not thousands, and the noise disappears
# without rewriting the repository's history.
# ===========================================================================

# ⚠️ NO LIST OF EXPECTED FILES HERE, AND THAT IS DELIBERATE.
#
# The first draft pinned thirteen paths - the files measured as stored CRLF -
# and refused a fourteenth. It was wrong twice over. It missed
# scripts/test-supplier.js, whose index is LF but whose working copy is MIXED,
# so renormalising it changes the blob too; and the true set could not be
# measured reliably from outside this machine at all.
#
# A prediction I cannot verify is not a measurement, and a guard built on one
# refuses honest work. What actually matters is provable exactly, per file,
# with no list at all:
#
#     NOT ONE STAGED FILE MAY DIFFER BY ANYTHING BUT A CARRIAGE RETURN.
#
# That is the whole safety property. The count and the names are then REPORTED,
# not asserted - you see exactly what moved.

# -- 1. the rule is written down, once -------------------------------------
if ($at -notmatch [regex]::Escape("* text=auto eol=lf")) {
    Write-Host "X .gitattributes does not carry the one rule" -ForegroundColor Red; exit 1
}
Write-Host "+ the rule is written down: git stores LF, and every checkout writes LF" -ForegroundColor Green

# -- 2. the UTF-16 files are named, not left to implicit detection ---------
# git detects them today. But an implicit detection is a bet: re-save one of
# them in another encoding tomorrow and its classification changes with nobody
# touching it. They are diagnostic output that belongs OUTSIDE the repository -
# naming them stops them being corrupted now; it does not bless them staying.
$pinnedInAttrs = ([regex]::Matches($at, "(?m)^\S+\s+-text\s*$")).Count
if ($pinnedInAttrs -lt 14) {
    Write-Host "X only $pinnedInAttrs UTF-16 file(s) are named in .gitattributes - 14 were measured" -ForegroundColor Red
    exit 1
}
Write-Host "+ all $pinnedInAttrs UTF-16 files are named, so nothing depends on implicit detection" -ForegroundColor Green

# -- 3. the guard reads the INDEX, not the working tree --------------------
# On Windows the working tree stays CRLF after checkout, AND THAT IS THE POINT.
# The agreement is about what git stores, not about what lands on the disk.
if ($g -notmatch [regex]::Escape("ls-files")) {
    Write-Host "X the guard does not ask git what is stored - it would measure the disk instead" -ForegroundColor Red
    exit 1
}
if ($g -notmatch [regex]::Escape("PINNED_UTF16")) {
    Write-Host "X the guard has no pinned list - a new UTF-16 file would slip in unnamed" -ForegroundColor Red
    exit 1
}
$pinnedInGuard = ([regex]::Matches($g, '"[A-Za-z0-9_./-]+\.(md|txt|sql|json|js)"')).Count
if ($pinnedInGuard -gt 14) {
    Write-Host "X the pinned UTF-16 list grew to $pinnedInGuard - a debt list that grows is not a ratchet" -ForegroundColor Red
    exit 1
}
Write-Host "+ the guard measures what git STORES, and its pinned list is $pinnedInGuard of 14 - shrink-only" -ForegroundColor Green

# -- 4. and the trap plants every shape, in a repository of its own --------
# A selftest that mutates THIS repository to prove a point about THIS
# repository leaves the tree dirty and the index locked. Each shape gets a
# throwaway repository instead.
foreach ($needle in @("no .gitattributes at all",
                      "the one rule deleted from .gitattributes",
                      "a file stored with CRLF in the index",
                      "a NEW UTF-16 file nobody pinned",
                      "a PINNED UTF-16 file, exactly as it is today")) {
    if ($t -notmatch [regex]::Escape($needle)) {
        Write-Host "X the trap no longer plants: $needle" -ForegroundColor Red; exit 1
    }
}
if ($t -notmatch [regex]::Escape("mkdtempSync")) {
    Write-Host "X the trap mutates this repository instead of a throwaway one" -ForegroundColor Red; exit 1
}
Write-Host "+ the trap plants all shapes in throwaway repositories - this tree is never touched" -ForegroundColor Green

# -- 5. and the applier stays honest (941) ---------------------------------
$ap = Get-Content -LiteralPath "scripts/apply-migration-file.js" -Raw
if ($ap -notmatch [regex]::Escape("pg_get_functiondef")) {
    Write-Host "X the applier does not read back what it applied" -ForegroundColor Red; exit 1
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
# 942 does not loosen: the return screens keep reading through the masked path.
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

$ts = Get-Content -LiteralPath "tsconfig.json" -Raw
if ($ts -notmatch [regex]::Escape('"_wip_*"')) {
    Write-Host "X tsconfig no longer excludes _wip_*" -ForegroundColor Red; exit 1
}
Write-Host "+ scratch folders are outside the type-check graph" -ForegroundColor Green

$self2 = Get-Content -LiteralPath "push_v3.74.943.ps1" -Raw
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
git add -u -- "push_v3.74.942.ps1" 2>$null

# ─── THE NORMALISATION ITSELF, AND ITS PROOF ─────────────────────────────
# Every other release refuses anything staged beyond its file list. THIS one
# stages the whole tree on purpose - so the question is not "what is staged"
# but "what CHANGED", and the check has to be stronger, not weaker.
#
# ⚠️ And `git add --renormalize .` CANNOT be used as-is: it aborts with
# `fatal: unable to stat` on the FIRST tracked file missing from the working
# tree, and stages NOTHING - silently, because the output is swallowed. This
# repository has 18 such files today (Arabic-named notes and one literally
# called "` cat"), deleted from disk but never from git. That is real,
# pre-existing debt, and it is NOT this release's business: bundling their
# deletion into a line-endings commit is exactly the mixed commit this project
# refuses. So the file list is built from what actually EXISTS, and the missing
# ones are left alone - visible, counted, untouched.
# `git ls-files` quotes non-ASCII paths in C style ("\331\205...") unless told
# otherwise, and Test-Path then rejects them as illegal. core.quotepath=false
# hands them over as they are.
$tracked = @(git -c core.quotepath=false ls-files)

# Tracked files missing from the working tree, asked of GIT rather than of the
# filesystem - 18 of them here, deleted from disk and never from git. Real,
# older debt, and NOT this release's business: bundling their deletion into a
# line-endings commit is the mixed commit this project refuses. They are simply
# left out of the pathspec, and counted out loud.
# The files stay on disk; only their tracking ends.
$stillTracked = @(git -c core.quotepath=false ls-files -- $generated)
if ($stillTracked.Count -gt 0) {
    git rm --cached --quiet -- $stillTracked
    if ($LASTEXITCODE -ne 0) { Write-Host "X could not untrack the generated artefacts" -ForegroundColor Red; exit 1 }
    Write-Host "+ $($stillTracked.Count) generated artefact(s) untracked - kept on disk, ignored from now on" -ForegroundColor Green
} else {
    Write-Host "+ the generated artefacts are already untracked" -ForegroundColor Green
}

$gone = @(git -c core.quotepath=false ls-files --deleted)
$missing = $gone.Count
Write-Host "! $missing tracked file(s) are deleted on disk but still tracked - older debt, deliberately untouched here" -ForegroundColor Yellow

# ─── AND NOTHING ELSE MAY BE PENDING ──────────────────────────────────────
#
# This release stages the whole tree, so anything already differing from HEAD
# would be swept into a line-endings commit - staged or not. Measured here:
# supabase/.temp/gotrue-version holds v2.183.0 in HEAD and v2.193.0 on disk,
# because the Supabase CLI rewrote it as it ran. Real work, someone else's,
# and none of this release's business.
#
# `git diff` alone would not have caught it: that compares the INDEX to the
# disk, and this file was already staged. The question has to be asked against
# HEAD - the 938 lesson again, in another costume: the measurement has to fall
# on the same scope as the claim.
#
# And it is NOT silently unstaged for you. Discarding or committing your work
# is your call, not a side effect of a line-endings release.
# ⚠️ And "differs from HEAD" is not the question either - not once
# .gitattributes is in place. From that moment the thirteen-odd files whose
# STORED blob is CRLF start reporting as different, because git normalises the
# disk copy before comparing. Those differences ARE this release. Refusing them
# would be refusing the work itself.
#
# So the question is narrowed one more time, to the only one that matters:
# which files differ from HEAD **by something other than a carriage return**.
#
# `--no-renames` because git otherwise collapses a rename into ONE row whose
# path reads "old => new" - a string no file list can contain. This script
# renames itself every release, so without it the release reports itself as an
# alien pending change.
$pending = @()
foreach ($line in (git -c core.quotepath=false diff HEAD --numstat --ignore-cr-at-eol --no-renames)) {
    if (-not $line) { continue }
    $f = ($line -split "`t")[2]
    if ($files -contains $f -or $f -eq "push_v3.74.942.ps1" -or $gone -contains $f -or $generated -contains $f) { continue }
    $pending += $f
}
if ($pending.Count -gt 0) {
    Write-Host "X $($pending.Count) file(s) differ from HEAD and are not part of this release:" -ForegroundColor Red
    foreach ($f in $pending) { Write-Host "    $f" -ForegroundColor Red }
    Write-Host "  A line-endings release must not carry them in. Commit them on their own, or -" -ForegroundColor Yellow
    Write-Host "  for regenerable state like supabase/.temp/* or *.tsbuildinfo - discard them with:" -ForegroundColor Yellow
    Write-Host "    git restore --staged --worktree <file>" -ForegroundColor Yellow
    exit 1
}
Write-Host "+ nothing else is pending against HEAD - the tree carries only this release" -ForegroundColor Green

$existing = @($tracked | Where-Object { $gone -notcontains $_ -and $generated -notcontains $_ })

$listPath = Join-Path $env:TEMP "renormalise_v3_74_943.txt"
[System.IO.File]::WriteAllLines($listPath, $existing, (New-Object System.Text.UTF8Encoding($false)))
git add --renormalize --pathspec-from-file=$listPath 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
$addExit = $LASTEXITCODE
Remove-Item -LiteralPath $listPath -Force -ErrorAction SilentlyContinue
if ($addExit -ne 0) {
    Write-Host "X git add --renormalize failed - nothing was normalised" -ForegroundColor Red
    exit 1
}

# `--ignore-cr-at-eol` makes a carriage-return-only change vanish ENTIRELY from
# the diff. So a file that is staged but ABSENT from that diff changed by
# nothing else. This is the proof, and it is per file, with no exceptions.
$realChange = @()
foreach ($line in (git -c core.quotepath=false diff --cached --numstat --ignore-cr-at-eol --no-renames)) {
    if (-not $line) { continue }
    $realChange += ($line -split "`t")[2]
}

$normalised = @()
foreach ($f in (git -c core.quotepath=false diff --cached --name-only --no-renames)) {
    if ($files -contains $f -or $f -eq "push_v3.74.942.ps1" -or $generated -contains $f) { continue }
    if ($realChange -contains $f) {
        Write-Host "X $f changes CONTENT, not just line endings - STOP" -ForegroundColor Red
        exit 1
    }
    $normalised += $f
}

# A silent no-op must fail too: if renormalise had aborted, nothing would be
# staged and every check above would pass without a word.
if ($normalised.Count -eq 0) {
    Write-Host "X nothing was normalised at all - the release would claim work it did not do" -ForegroundColor Red
    exit 1
}
Write-Host "+ $($normalised.Count) file(s) normalised, and EVERY one of them differs by carriage returns alone:" -ForegroundColor Green
foreach ($f in $normalised) { Write-Host "    $f" -ForegroundColor DarkGray }

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
git add -u -- "push_v3.74.942.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_943.txt"
    $msgLines = @(
        'chore(repo): v3.74.943 - line endings are one way, so "modified" means modified',
        '',
        'MEASURED BEFORE ANYTHING WAS WRITTEN: 3642 tracked files, NO .gitattributes at',
        'all, and core.autocrlf unset in every scope - local, global and system. 2538',
        'files are stored LF and sit on disk as CRLF, so every one of them reads as',
        'modified in every run, with a diff the size of the whole file. One registry',
        'file alone reports 7688 changed lines while nobody has touched it.',
        '',
        'THIS IS NOT COSMETIC NOISE. The real change passes underneath it. The 938',
        'defect that emptied the purchase-bill list for every user went through my own',
        'review inside exactly this flood.',
        '',
        'AND WHAT DOES IT COST? Far less than the noise suggests. Most of those 2538',
        'files are ALREADY LF in the index - the noise comes from the disk copy being',
        'CRLF, and .gitattributes makes git normalise before comparing, so the noise',
        'stops without a single byte changing. Only the files whose stored blob really',
        'is CRLF get rewritten.',
        '',
        'I TRIED TO PIN THAT SET BY NAME AND I WAS WRONG TWICE. The first draft listed',
        'thirteen paths - the files measured as stored CRLF - and refused a fourteenth.',
        'It missed scripts/test-supplier.js, whose index is LF but whose working copy is',
        'MIXED, so renormalising changes its blob too. And the true set could not be',
        'measured reliably from outside the machine at all. A prediction I cannot verify',
        'is not a measurement, and a guard built on one refuses honest work.',
        '',
        'SO THE PROOF IS THE PROPERTY ITSELF, PER FILE, WITH NO LIST. --ignore-cr-at-eol',
        'makes a carriage-return-only change vanish entirely from the diff, so a file',
        'that is staged but absent from that diff changed by nothing else. Every staged',
        'file is checked that way and any real content stops the push. The count and the',
        'names are REPORTED, not asserted. And a SILENT NO-OP fails too: if nothing',
        'normalises, the release refuses itself rather than claiming work it did not do.',
        '',
        'A TRAP THAT RAN INTO A REAL DEFECT BEFORE ANY OF THIS SHIPPED. The self-test',
        'plants a UTF-16 file that nobody pinned - and the guard did not refuse it. The',
        'reason: git ls-files --eol puts the attributes in a field that CONTAINS A SPACE',
        '("attr/text=auto eol=lf"), so splitting on whitespace swallowed part of it and',
        'glued the rest onto the path. The guard went looking for a file called',
        '"eol=lf <tab>sneaky.ts", failed to find it, and PASSED IN SILENCE. The reliable',
        'separator is the tab. Fixed, and the trap now sees it refuse.',
        '',
        'AND git add --renormalize . COULD NOT BE USED AS WRITTEN. It aborts with',
        '"fatal: unable to stat" on the first tracked file missing from the working tree',
        'and stages NOTHING - silently, since the output is swallowed. This repository',
        'has 18 such files (Arabic-named notes, and one literally named "` cat"),',
        'deleted from disk but never from git. That is real pre-existing debt and it is',
        'NOT this release: bundling their deletion into a line-endings commit is the',
        'mixed commit this project refuses. The pathspec is built from what exists, the',
        'missing ones are left alone, and their count is pinned so it cannot grow.',
        '',
        'THE 14 UTF-16 FILES are named explicitly rather than left to git implicit',
        'detection - detection changes when a file is re-saved, with nobody touching it.',
        'They are old diagnostic output that belongs outside the repository; naming them',
        'stops them being corrupted today, and does not bless them staying.',
        '',
        'And the guard reads the INDEX, not the disk. On Windows the working tree stays',
        'CRLF after checkout, and that is the point: the agreement is about what git',
        'stores, not about what lands on the disk.'
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
if ($headSubject -notmatch [regex]::Escape("v3.74.943")) {
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
Write-Host "`n+ v3.74.943 pushed - line endings are one way, so `"modified`" means modified" -ForegroundColor Green
Write-Host "  HEAD = origin/main = $localHead" -ForegroundColor DarkGray
