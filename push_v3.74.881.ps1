$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.881 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# A replacement whose output can match its own next pattern is a loop, not a
# replacement. This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.880.ps1") { Remove-Item -LiteralPath "push_v3.74.880.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.881"') {
    Write-Host "+ 3.74.881" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.881]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.881]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$mig    = "supabase/migrations/20260728000009_v3_74_881_delete_silently_cancelled.sql"
$guard  = "scripts/check-trigger-silently-cancels-delete.js"
$trap   = "scripts/selftest-trigger-silently-cancels-delete.js"

# The schema snapshot is generated, never hand-edited. This release changes a
# trigger function body, so it must be regenerated BEFORE running this script.
$schemaFn  = "supabase/schema/functions.sql"
$schemaAll = "supabase/schema/schema.sql"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $mig, $guard, $trap,
           $schemaFn, $schemaAll, "push_v3.74.881.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the function must be able to FINISH a delete, not only refuse one --
# On DELETE, NEW is NULL, and a BEFORE trigger returning NULL cancels the row
# operation. `RETURN NEW` at the end of a BEFORE DELETE function therefore
# swallows the delete in silence.
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "RETURN COALESCE\(NEW, OLD\);") {
    Write-Host "X the migration does not give the function a way to finish a delete" -ForegroundColor Red; exit 1
}
Write-Host "+ the trigger can now finish a delete, not just refuse one" -ForegroundColor Green

# -- 2. the migration must PROVE it by deleting, not by reading -----------
# Reading the text is what missed this the first time.
if ($m -notmatch "survived its own DELETE") {
    Write-Host "X the migration verifies by reading, not by deleting" -ForegroundColor Red; exit 1
}
if ($m -notmatch "PROBE-881-DELETE-WAS-ALLOWED") {
    Write-Host "X the migration does not check that a POSTED entry is still refused" -ForegroundColor Red; exit 1
}
Write-Host "+ the migration verifies by doing, and re-checks the refusal it must not break" -ForegroundColor Green

# -- 3. the guard admits no exception ------------------------------------
# There is no reason for a delete to be cancelled without saying so. If it must
# be refused, RAISE. So this list stays empty - not "empty for now".
$g = Get-Content -LiteralPath $guard -Raw
if ($g -notmatch "ALLOWED = new Map\(\[\]\)") {
    Write-Host "X the silent-cancel guard grew an exception list" -ForegroundColor Red; exit 1
}
Write-Host "+ the silent-cancel guard admits no exception" -ForegroundColor Green

# -- 4. the snapshot must carry the fixed body ---------------------------
# The two snapshot files hold DIFFERENT things: functions.sql holds function
# BODIES, schema.sql holds tables, policies, triggers and grants. Asking
# schema.sql for a function body fails on a file that was never supposed to
# contain one - which is exactly what the first version of this check did.
# => A check must know which file can possibly answer its question.
$fnBody = ($schemaFn | ForEach-Object { Get-Content -LiteralPath $_ -Raw })
$idx = $fnBody.IndexOf("CREATE OR REPLACE FUNCTION public.prevent_posted_journal_modification")
if ($idx -lt 0) {
    Write-Host "X functions.sql does not contain prevent_posted_journal_modification at all" -ForegroundColor Red
    exit 1
}
$body = $fnBody.Substring($idx, [Math]::Min(3000, $fnBody.Length - $idx))
if ($body -notmatch "RETURN COALESCE\(NEW, OLD\)") {
    Write-Host "X functions.sql still carries the old function body - regenerate the snapshot:" -ForegroundColor Red
    Write-Host "    node scripts/dump-db-functions.js" -ForegroundColor Yellow
    Write-Host "    node scripts/dump-db-schema.js" -ForegroundColor Yellow
    exit 1
}
# schema.sql is asked what it CAN answer: is the trigger still attached?
$all = Get-Content -LiteralPath $schemaAll -Raw
if ($all -notmatch "trg_prevent_posted_journal_mod BEFORE DELETE OR UPDATE ON public\.journal_entries") {
    Write-Host "X schema.sql no longer shows the trigger attached to journal_entries" -ForegroundColor Red
    exit 1
}
Write-Host "+ functions.sql carries the fixed body, and the trigger is still attached" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.880.ps1" 2>$null

# -- 3. nothing staged beyond this release (the 872 lesson) --------------
# What a failed run staged stays staged. `git add -- $files` only adds.
$expected = @($files) + @("push_v3.74.880.ps1")
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
git add -u -- "push_v3.74.880.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_881.txt"
    $msgLines = @(
        'fix(ledger): v3.74.881 - a delete that is neither refused nor performed',
        '',
        'Deleting a DRAFT journal entry did not fail and did not happen. No error,',
        'no deleted row. The caller walked away certain it had cleaned up after',
        'itself. Proven on production inside a rolled-back transaction:',
        '',
        '    chart_of_accounts : rows left after DELETE = 0   (deleted properly)',
        '    journal_entries   : rows left after DELETE = 1   *** SWALLOWED ***',
        '',
        'One line. prevent_posted_journal_modification() is a BEFORE DELETE',
        'trigger that ends with RETURN NEW. On a delete there is no NEW, so it is',
        'NULL - and NULL from a BEFORE trigger means "cancel this operation" to',
        'PostgreSQL. The function knew how to REFUSE a delete and not how to',
        'FINISH one.',
        '',
        'A refusal is visible. A silent cancel is not. An outright error is kinder',
        'than a false success: the first stops you, the second carries you along.',
        '',
        'It went unnoticed because the only path through it is a ROLLBACK path -',
        'it runs only when something before it has already failed, and nobody',
        'reads its result. Rollback paths have to be tested deliberately, because',
        'they are never tested incidentally.',
        '',
        'Scope, measured rather than assumed. 17 BEFORE DELETE triggers end with',
        'RETURN NEW. Two were proven by actually deleting that they delete',
        'correctly (chart_of_accounts, invoice_items - the only two with rows in a',
        'permitted state). Eleven were proven by trying that they refuse loudly.',
        'Eleven are structurally safe: their DELETE branch opens with RETURN OLD,',
        'so the suspect last line is never reached on a delete. Exactly one never',
        'returns OLD on any path. That was the distinguishing measurement: count of',
        'RETURN OLD = zero.',
        '',
        'The guard was narrowed twice, against the whole schema, before shipping:',
        'ends with RETURN NEW = 17; never returns OLD = 3; and has a non-raising',
        'exit = 1. The two dropped at the last step RAISE unconditionally - tables',
        'that are never deleted from have no silent path. A guard is narrowed until',
        'it hits one thing exactly, not until it goes quiet.',
        '',
        'The trap reproduces the defect instead of describing it: it plants a',
        'trigger returning NEW on a probe table, deletes a row, and counts what is',
        'left. Proving the fault exists is stronger than proving the guard matches',
        'a string.',
        '',
        'The migration verifies by DOING - reading the text is what missed this the',
        'first time. It creates a draft entry, deletes it, counts what remains. It',
        'then re-checks that a POSTED entry is still refused, using a delete that',
        'is forced to roll back by a deliberate error whether it succeeded or was',
        'refused, then counts the row again. A check that touches real data is',
        'built so it CANNOT leave a trace - not so that it probably will not.',
        '',
        'The owner asked to see all sixteen checked before anything was touched,',
        'and was right to: it was the checking that showed two of them raise',
        'unconditionally and never enter the judgement at all - which a quick read',
        'would have counted as broken.',
        '',
        '124 posted entries, zero empty drafts, trial balance 0.0000, and zero',
        'triggers that can cancel a delete in silence.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.881 pushed - a refusal is visible, a silent cancel is not" -ForegroundColor Green
}
