$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.880 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# A replacement whose output can match its own next pattern is a loop, not a
# replacement. This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.879.ps1") { Remove-Item -LiteralPath "push_v3.74.879.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.880"') {
    Write-Host "+ 3.74.880" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.880]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.880]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$mig    = "supabase/migrations/20260728000008_v3_74_880_vendor_credit_atomic_and_scope.sql"
$guard  = "scripts/check-impossible-rollback.js"
$trap   = "scripts/selftest-impossible-rollback.js"
$page   = "app/vendor-credits/new/page.tsx"
$helper = "lib/purchase-returns-vendor-credits.ts"

# نسخة المخطَّط تُولَّد قبل النشر، لا تُحرَّر باليد.
# v3.74.880 — الترحيل أسقط `auto_inventory_for_vendor_credit`، وبقيت النسخة
# تصفها **ومصرَّحاً بها لـanon**. فإعادة بناء القاعدة من المستودع كانت
# ستُحييها بصلاحياتها. ⇒ **حذفٌ من القاعدة بلا تحديث النسخة ليس حذفاً، بل
# تأجيل.** والحارس أمسكها فى أول تشغيل.
$schemaFn  = "supabase/schema/functions.sql"
$schemaAll = "supabase/schema/schema.sql"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $mig, $guard, $trap, $page, $helper,
           $schemaFn, $schemaAll, "push_v3.74.880.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. neither caller may write the header and the lines separately -------
# The header insert POSTS A JOURNAL ENTRY through a database trigger. A second
# statement that can fail therefore leaves a posted credit note with no lines
# under it - which is exactly what production showed. Both callers must go
# through the one function that rolls itself back.
foreach ($f in @($page, $helper)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'from\(\s*["'']vendor_credits["'']\s*\)\s*
?
?\s*\.?insert' -or
        $c -match 'from\(\s*["'']vendor_credit_items["'']\s*\)\s*
?
?\s*\.?insert') {
        Write-Host "X $f still writes a vendor credit in two steps" -ForegroundColor Red; exit 1
    }
    if ($c -notmatch "create_vendor_credit_with_items") {
        Write-Host "X $f does not go through the atomic function" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both vendor-credit callers write header and lines as one operation" -ForegroundColor Green

# -- 2. the impossible rollback is gone, not merely logged ----------------
$h = Get-Content -LiteralPath $helper -Raw
if ($h -match "VENDOR_CREDIT_ROLLBACK_DELETE_FAILED") {
    Write-Host "X the manual rollback is still there - a delete a trigger refuses is not a rollback" -ForegroundColor Red
    exit 1
}
Write-Host "+ the rollback that could never succeed is gone" -ForegroundColor Green

# -- 3. the migration must verify itself, and stop the inventory trigger --
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "RAISE EXCEPTION") {
    Write-Host "X the migration writes without verifying what it wrote" -ForegroundColor Red; exit 1
}
if ($m -notmatch "DROP FUNCTION IF EXISTS public\.auto_inventory_for_vendor_credit") {
    Write-Host "X the migration does not stop the inventory trigger" -ForegroundColor Red; exit 1
}
# A SECURITY DEFINER here would bypass RLS unnoticed. Scope the search to the
# function HEADER (between the CREATE line and the "AS $$" that opens the body):
# the phrase also appears inside the migration's own assertion message, and a
# check that trips on the text asserting its own safety is worse than none.
if ($m -match "CREATE OR REPLACE FUNCTION public\.create_vendor_credit_with_items[\s\S]*?AS \`$\`$") {
    if ($Matches[0] -match "SECURITY DEFINER") {
        Write-Host "X the atomic function must not be SECURITY DEFINER" -ForegroundColor Red; exit 1
    }
} else {
    Write-Host "X could not locate the atomic function header in the migration" -ForegroundColor Red; exit 1
}
Write-Host "+ the migration verifies itself and runs with the caller's own rights" -ForegroundColor Green

# -- 4. the narrowed guard keeps its measured baseline --------------------
# 52 alarms became 6 by asking a sharper question, not by adding exceptions.
$g = Get-Content -LiteralPath $guard -Raw
if ($g -notmatch "const BASELINE = 6") {
    Write-Host "X the impossible-rollback baseline is not 6" -ForegroundColor Red; exit 1
}
Write-Host "+ impossible-rollback baseline is 6 (was 7 before this release)" -ForegroundColor Green

# -- 5. the snapshot must not describe what the migration dropped ---------
# Regenerate it (dump-db-functions + dump-db-schema) BEFORE running this
# script; it is a generated artefact, never hand-edited.
foreach ($f in @($schemaFn, $schemaAll)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match "auto_inventory_for_vendor_credit") {
        Write-Host "X $f still describes a function this release dropped - regenerate the snapshot:" -ForegroundColor Red
        Write-Host "    node scripts/dump-db-functions.js" -ForegroundColor Yellow
        Write-Host "    node scripts/dump-db-schema.js" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "+ the snapshot no longer describes the dropped inventory trigger" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.879.ps1" 2>$null

# -- 3. nothing staged beyond this release (the 872 lesson) --------------
# What a failed run staged stays staged. `git add -- $files` only adds.
$expected = @($files) + @("push_v3.74.879.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the impossible-rollback guard refuses (and stays silent)..." -ForegroundColor Cyan
node scripts/selftest-impossible-rollback.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the impossible-rollback guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Counting compensating deletes a trigger can refuse..." -ForegroundColor Cyan
# NO `| Select-Object -First N` here. -First STOPS the upstream pipeline, node
# gets EPIPE while still writing its tracked-items list, its own error handler
# exits 1, and the release calls a PASSING guard a failure. It printed
# "+ No new impossible rollbacks" and was declared broken in the same breath.
# `-Last N` is safe: it drains the stream. `-First N` on a live process is not.
# => How a check is DISPLAYED must not change what it MEANS.
node scripts/check-impossible-rollback.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a new impossible rollback appeared" -ForegroundColor Red; exit 1 }

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

Write-Host "Checking no table is open to anonymous visitors..." -ForegroundColor Cyan
node scripts/check-anon-open-tables.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X tables are open to anon" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.879.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_880.txt"
    $msgLines = @(
        'fix(vendor-credits): v3.74.880 - a credit note posted with no lines under it',
        '',
        'The manual vendor-credit screen saved in two steps: header, then lines.',
        'The header insert POSTS A JOURNAL ENTRY for the full amount through a',
        'database trigger. The line insert then failed - every time, if a product',
        'was on it - with a message that lied: "Branch does not belong to company".',
        '',
        'What was left behind was worse than a failure. A posted credit note, its',
        'entry in the ledger, and nothing underneath it. The user saw an error and',
        'assumed nothing had been saved. Proven on production inside a transaction',
        'that was rolled back:',
        '',
        '    STEP 1 (header): journal_entry=b329... status=posted lines=3',
        '    STEP 2 (items):  *** FAILED *** -> Branch does not belong to company',
        '    AFTERWARDS: credit rows=1  items=0  journal lines=3  amount=1140',
        '',
        'The cause: auto_inventory_for_vendor_credit inserted into',
        'inventory_transactions without branch_id, warehouse_id or cost_center_id,',
        'all three NOT NULL with no default. It could not succeed under any',
        'circumstances. Its only possible effect was to abort the user.',
        '',
        'Its own comment says it skips the purchase-return path "to avoid',
        'duplicates and missing branch_id issues" - and the line below it does',
        'exactly what the comment warns about. A comment describing a guarantee is',
        'not the guarantee.',
        '',
        'Nobody complained because zero vendor credits have ever been created. The',
        'screen was never used. What has never run has never been tested - and this',
        'path had already been fixed four times today (865, 871, 873, 879) without',
        'once being executed. It was the first real execution that found this.',
        '',
        'A second landmine on the way. purchase-returns-vendor-credits.ts deleted',
        'the header when the lines failed. That delete was impossible: the credit',
        'is created "open" and prevent_vendor_credit_deletion allows only "draft"',
        'or "cancelled". Also proven, also rolled back:',
        '',
        '    rollback DELETE (status=open) : *** REFUSED ***',
        '    orphan header left behind : 1  (journal entry already posted)',
        '',
        'A manual rollback that can be refused is not a rollback. It is a wish.',
        '',
        'Three fixes. The inventory trigger is STOPPED, not repaired: a credit from',
        'a purchase return already gets its movement from the returns screen',
        '(measured - both real rows reference purchase_returns), and a credit that',
        'is not from a return has no goods moving at all. Reviving it would produce',
        'either a duplicate or a fiction. Before filling in missing data, ask',
        'whether the thing should run at all.',
        '',
        'Header and lines now go through one function that rolls itself back, for',
        'BOTH callers - one function, not a second copy of the fix. It is not',
        'SECURITY DEFINER: RLS stays the judge.',
        '',
        'And the scope message now distinguishes "branch is not set" from "branch',
        'belongs to another company". Same accepts, same refusals - only the',
        'sentence is true now. Silence makes you search; a false message makes you',
        'search in the wrong place.',
        '',
        'The new guard was measured before shipping and narrowed: "any delete from',
        'a trigger-guarded table" fired 52 times and almost all were correct - a',
        'user deleting a posted invoice SHOULD be refused. Narrowed to the',
        'compensating delete - inside an error branch, undoing an insert made just',
        'above - it is 6. Second time in one day a rule was measured against the',
        'whole project before shipping and cut back. 879 deleted one outright.',
        '',
        'Ten checks on production, every one rolled back: inventory, invoices and',
        'sales orders accept and refuse exactly as before; a manual credit with a',
        'product line now SUCCEEDS (items=1, journal lines=3, inventory rows=0); a',
        'bad line takes the whole thing down with it (orphan headers=0). Trial',
        'balance 0.0000.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.880 pushed - what is never run is never tested; a rollback that can be refused is a wish" -ForegroundColor Green
}
