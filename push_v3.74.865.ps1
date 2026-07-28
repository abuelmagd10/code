$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path -LiteralPath "push_v3.74.864.ps1") { Remove-Item -LiteralPath "push_v3.74.864.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.865"') {
    Write-Host "+ 3.74.865" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.865]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.865]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$guard   = "scripts/check-phantom-columns.js"
$gselft  = "scripts/selftest-phantom-columns.js"
$mig     = "supabase/migrations/20260728000003_v3_74_865_journal_entries_created_by.sql"
$approve = "app/api/journal-entries/[id]/approve/route.ts"
$mroute  = "app/api/journal-entries/manual/route.ts"
$msvc    = "lib/services/manual-journal-command.service.ts"
$cur     = "lib/currency-service.ts"
$period  = "lib/period-closing.ts"
$vcred   = "lib/purchase-returns-vendor-credits.ts"
$ship    = "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts"
$cust    = "app/api/customers/update/route.ts"
$perm    = "app/api/permissions/route.ts"
$permb   = "app/api/permissions/branch-access/route.ts"
$permt   = "app/api/permissions/transfer/route.ts"
$permta  = "app/api/permissions/transfer/[id]/approve/route.ts"
$permtr  = "app/api/permissions/transfer/[id]/reject/route.ts"
$po      = "app/api/purchase-orders/route.ts"
$xfer    = "app/inventory-transfers/[id]/page.tsx"
$pret    = "app/purchase-returns/new/page.tsx"
$settings= "app/settings/page.tsx"
$uw      = "scripts/check-unchecked-writes.js"
$snap    = "supabase/schema/schema.sql"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $guard, $gselft, $mig, $approve, $mroute, $msvc, $cur, $period, $vcred,
           $ship, $cust, $perm, $permb, $permt, $permta, $permtr, $po,
           $xfer, $pret, $settings, $uw, $snap, "push_v3.74.865.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the guard must now see insert and upsert, not update alone -----------
# The whole release exists because .insert() was outside its reach, and an
# insert onto a phantom column loses the ROW - not a field.
$gc = Get-Content -LiteralPath $guard -Raw
if ($gc -notmatch "update\|insert\|upsert") {
    Write-Host "X the phantom-column guard still only inspects .update()" -ForegroundColor Red
    Write-Host "  An insert onto a phantom column never creates the row at all." -ForegroundColor Red
    exit 1
}
if ($gc -notmatch [regex]::Escape('/\.tsx?$/')) {
    Write-Host "X the guard no longer reaches .tsx pages - they write to tables directly" -ForegroundColor Red
    exit 1
}
Write-Host "+ guard covers update/insert/upsert across .ts and .tsx" -ForegroundColor Green

# -- 2. the self-test must carry BOTH new traps and BOTH new inverses -------
# A widened guard can introduce noise. 863 died of noise, not of silence.
$sc = Get-Content -LiteralPath $gselft -Raw
foreach ($needle in @("PROBE_INSERT", "PROBE_UPSERT", "PROBE_INSERT_CLEAN", "PROBE_TSX_CLEAN")) {
    if ($sc -notmatch $needle) {
        Write-Host "X the self-test is missing $needle" -ForegroundColor Red
        Write-Host "  Widening a guard is not accepted without an inverse trap." -ForegroundColor Red
        exit 1
    }
}
# A guard measured only by its exit code can be satisfied by breaking it.
# Run without a database, check-phantom-columns crashed with getaddrinfo and
# exited 1 - and the self-test read that crash as a refusal. Every positive
# trap must now find its own planted column name in the guard's output.
if ($sc -notmatch "needle") {
    Write-Host "X the self-test still accepts a crash as a refusal" -ForegroundColor Red
    Write-Host "  A guard measured only by its exit code can be satisfied by disabling it." -ForegroundColor Red
    exit 1
}
Write-Host "+ self-test carries two positive traps, two inverse ones, and names its probes" -ForegroundColor Green

# -- 3. every repaired audit write must name the REAL columns ---------------
# Deliberately a POSITIVE assertion, not a blanket ban on the old names.
#
# My first draft of this check banned the phantom names outright and produced
# three false alarms against my own repaired tree: "transaction_type:" contains
# "action_type:", and two of the names survive inside explanatory comments.
# That is precisely the failure that killed the tool in 863 - a guard whose
# alarms are mostly noise trains its reader to ignore it.
#
# The authority on phantom columns is check-phantom-columns.js against the
# LIVE schema, which runs below. This check only proves the repair landed.
foreach ($f in @($cust, $permb, $perm, $permt, $permta, $permtr, $po, $xfer, $pret)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -cnotmatch "\bentity:" -and $c -cnotmatch "\bentity_id:") {
        Write-Host "X $f does not write audit_logs.entity / entity_id" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ every repaired audit write names the real columns" -ForegroundColor Green

# -- 4. the silent currency split ------------------------------------------
# companies.currency does not exist. The update failed while the screen,
# localStorage and the cookie were all updated - so the UI showed one
# currency and the books kept another.
$stc = Get-Content -LiteralPath $settings -Raw
if ($stc -cmatch [regex]::Escape("update({ currency: pendingCurrency })")) {
    Write-Host "X settings still writes companies.currency - a column that does not exist" -ForegroundColor Red
    exit 1
}
if ($stc -notmatch "COMPANY_BASE_CURRENCY_UPDATE_FAILED") {
    Write-Host "X the base-currency change can still fail without telling anyone" -ForegroundColor Red
    exit 1
}
Write-Host "+ base-currency change writes the real column and reports failure" -ForegroundColor Green

# -- 5. the audit writes must be checked, not merely renamed ---------------
# try/catch around supabase-js catches nothing: it RETURNS { error }.
foreach ($f in @($cust, $permb, $perm, $permt, $permta, $permtr, $po, $xfer, $pret)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "AUDIT_LOG_WRITE_FAILED") {
        Write-Host "X $f renamed the columns but still discards the result" -ForegroundColor Red
        Write-Host "  try/catch around supabase-js catches nothing - it returns { error }." -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ every repaired audit write now reports its own failure" -ForegroundColor Green

# -- 6. manual-journal governance (owner decision, 26 Jul 2026) ------------
#   owner            -> posts directly
#   general_manager  -> approved by the OWNER
#   branch accountant-> own branch only, approved by owner or GM
$ms = Get-Content -LiteralPath $msvc -Raw
# The name survives in a comment explaining what it used to do, so match the
# declaration itself - not the bare word.
if ($ms -cmatch "const PRIVILEGED_POST_ROLES") {
    Write-Host "X the general manager can still self-post a manual journal" -ForegroundColor Red; exit 1
}
if ($ms -notmatch [regex]::Escape('SELF_POST_ROLES = new Set(["owner"])')) {
    Write-Host "X only the owner may post a manual journal without approval" -ForegroundColor Red; exit 1
}
if ($ms -notmatch "assertBranchScope") {
    Write-Host "X a branch accountant is not confined to his own branch" -ForegroundColor Red; exit 1
}
if ($ms -notmatch "MANUAL_JOURNAL_BRANCH_SCOPE") {
    Write-Host "X the branch-scope refusal carries no identifiable error" -ForegroundColor Red; exit 1
}
Write-Host "+ manual-journal governance matches the owner decision" -ForegroundColor Green

# -- 7. the approval path must EXIST and must re-verify --------------------
# A comment since v3.74.567 promised a second privileged user would post the
# draft. There was no such route anywhere in the project. A comment describing
# a mechanism is not the mechanism.
$ap = Get-Content -LiteralPath $approve -Raw
if ($ap -notmatch "self_approval") {
    Write-Host "X the approval route lets a user approve his own entry" -ForegroundColor Red; exit 1
}
if ($ap -notmatch "unbalanced") {
    Write-Host "X the approval route posts without re-checking the balance" -ForegroundColor Red
    Write-Host "  A draft is editable between creation and approval." -ForegroundColor Red
    exit 1
}
if ($ap -notmatch "requireOpenFinancialPeriod") {
    Write-Host "X the approval route does not re-check the period at approval time" -ForegroundColor Red; exit 1
}
if ($ap -notmatch [regex]::Escape('.eq("status", "draft")')) {
    Write-Host "X the post is not atomic - two approvers could both post it" -ForegroundColor Red; exit 1
}
Write-Host "+ approval route exists, re-verifies, and posts atomically" -ForegroundColor Green

# -- 8. the branch accountant must actually be allowed in ------------------
$mr = Get-Content -LiteralPath $mroute -Raw
if ($mr -notmatch "accountant") {
    Write-Host "X the branch accountant is still blocked from manual journals" -ForegroundColor Red; exit 1
}
Write-Host "+ the branch accountant can reach the manual-journal route" -ForegroundColor Green

# -- 9. ground won must be pinned down -------------------------------------
# This was not a goal of the release. Repairing the phantom columns also
# checked 13 previously discarded write results, so the counter fell on its
# own - and the guard refused the push until the baseline followed it down.
# A silent defect rarely travels alone: whoever did not verify the column
# name did not verify the result either. Same cause - nothing forced them.
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 247;") {
    Write-Host "X the unchecked-writes baseline is not 247" -ForegroundColor Red
    Write-Host "  Ground won and not pinned down is ground that comes back." -ForegroundColor Red
    exit 1
}
Write-Host "+ unchecked-writes baseline tightened 260 -> 247" -ForegroundColor Green

# -- 10. a new column exists in TWO places, not one ------------------------
# The migration adds the column to the live database. The snapshot is what
# check-phantom-selects reads, and it does not update itself - so the new
# approve route "read a column that does not exist" until the snapshot caught
# up. Same stale-snapshot family as defect 3 in 863; there it produced false
# alarms on writes, here a false alarm on a read.
$snc = Get-Content -LiteralPath $snap -Raw
if ($snc -cnotmatch "reversal_of_entry_id uuid,\s*\r?\n\s*created_by uuid") {
    Write-Host "X the schema snapshot does not carry journal_entries.created_by" -ForegroundColor Red
    Write-Host "  A migration updates the database. It does not update the snapshot." -ForegroundColor Red
    exit 1
}
Write-Host "+ schema snapshot carries the new column" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.864.ps1" 2>$null

Write-Host "Proving the phantom-column guard refuses insert AND upsert..." -ForegroundColor Cyan
node scripts/selftest-phantom-columns.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the phantom-column guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes (update + insert + upsert)..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js --require-db | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.864.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_865.txt"
    $msgLines = @(
        'fix(schema): v3.74.865 - the guard watched updates only, and an insert loses the whole row',
        '',
        'The phantom-column guard, rebuilt and made honest in 863, inspected',
        '.update() alone. In the unwatched space - .insert() and .upsert() - there',
        'were 14 real phantom columns, each verified against the LIVE schema rather',
        'than the snapshot, because trusting a lagging snapshot was defect 3 of the',
        'three that broke the tool in 863. Seven of the candidates turned out to be',
        'snapshot lag and were dismissed.',
        '',
        'The difference in consequence is the whole point. A failed update loses one',
        'change. A failed insert never creates the row, so the feature dies entirely,',
        'in silence, for as long as the phantom column sits there.',
        '',
        'I did not reason about the impact from the code. I counted rows:',
        '',
        '    manual_entry journal entries ... 0',
        '    fx_gain_loss journal entries ... 0',
        '    shipments ...................... 0',
        '    vendor_credits ................. 0',
        '',
        'The manual journal entry is the worst of them. The screen exists, it calls',
        '/api/journal-entries/manual, the route calls the service, and the service',
        'writes created_by - a column that does not exist. PostgREST rejects an',
        'unknown column from its schema cache before issuing any SQL, so nothing',
        'appears in the database logs either. Every adjustment, depreciation and',
        'accrual anyone ever tried to enter by hand failed. Since the beginning.',
        '',
        'Chasing that one down found the feature broken on three levels, not one:',
        'creation always failed; there was NO approval route anywhere in the project',
        'even though a comment from v3.74.567 promised a second privileged user would',
        'post the draft; and the governance disagreed with itself across three layers.',
        '',
        'That makes three places in two releases where a comment described a mechanism',
        'that was not there - after the v3.74.252 guarantee in the refund files (864),',
        'and after currency-service line 818 stating "the table has no is_approved"',
        'while line 460 writes it. A comment states an intention. The line underneath',
        'it is the guarantee.',
        '',
        'The quietest defect was companies.currency. The real column is base_currency,',
        'so changing the company currency failed at the database while the screen,',
        'localStorage and the cookie were all updated successfully. The user saw one',
        'currency; the books kept another. A visible error would have been kinder.',
        '',
        'Governance for manual journals, per the owner:',
        '',
        '  owner              posts directly, no approval',
        '  general manager    any branch, approved by the OWNER',
        '  branch accountant  his own branch only, approved by owner or GM',
        '',
        'Separation of duties is absolute: nobody approves an entry he created, not',
        'even the owner. An accountant with no branch on his membership is refused -',
        'being unable to verify is not permission.',
        '',
        'The approval route re-checks the balance and the period at approval time,',
        'because a draft is editable in between, and posts atomically on',
        'status=draft so two approvers cannot post it twice.',
        '',
        'Widening a guard risks noise, and 863 died of noise rather than silence, so',
        'the self-test gained two positive traps (insert, upsert) and two inverse',
        'ones (a clean insert, a clean .tsx page) - the scope now reaches UI pages',
        'that write to tables directly.',
        '',
        'One thing I did not set out to do. Repairing the phantom columns also',
        'checked 13 write results that had been discarded, so the unchecked-writes',
        'counter fell on its own and the guard refused the push until the baseline',
        'followed it down: 260 -> 247. Six of those thirteen were try/catch around',
        'supabase-js - the exact shape that file warns about on line 174, since the',
        'client returns { error } and never throws. A silent defect rarely travels',
        'alone: whoever did not verify the column name did not verify the result',
        'either, for the same reason - nothing forced them to.',
        '',
        'The phantom-SELECT guard then refused too, and it was right in the same way:',
        'a new column lives in two places. The migration adds it to the database; the',
        'snapshot at supabase/schema/schema.sql does not update itself, so the new',
        'approve route was "reading a column that does not exist". Same stale-snapshot',
        'family as defect 3 in 863 - false alarms on writes there, a false alarm on a',
        'read here. The snapshot now travels in the same commit as the column.',
        '',
        'Verified on production inside a rolled-back transaction: the manual journal',
        'insert now succeeds. 14 -> 0 phantom columns. 126 entries, trial balance',
        '0.0000, nothing deleted, nothing edited - one new column.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.865 pushed - an insert onto a phantom column loses the whole row" -ForegroundColor Green
}
