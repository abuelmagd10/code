$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.876 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.875.ps1") { Remove-Item -LiteralPath "push_v3.74.875.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.876"') {
    Write-Host "+ 3.74.876" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.876]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.876]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$sr = "lib/sales-returns.ts"
$uw = "scripts/check-unchecked-writes.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $sr, $uw, "push_v3.74.876.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the mine is gone -------------------------------------------------
# processReturnAccounting built a journal entry with no branch_id - a NOT NULL
# column - and then discarded the result, so it would have failed every time
# and skipped the ledger in silence while reporting success. It never broke a
# build because it never ran. That combination is what makes it a mine rather
# than merely dead code.
$c = Get-Content -LiteralPath $sr -Raw
foreach ($fn in @("async function processReturnAccounting",
                  "async function processInventoryReturn",
                  "async function updateInvoiceItemsReturn",
                  "async function updateInvoiceAfterReturn",
                  "async function updateSalesOrderAfterReturn",
                  "export async function processSalesReturn")) {
    if ($c -match [regex]::Escape($fn)) {
        Write-Host "X $fn is still defined" -ForegroundColor Red; exit 1
    }
}
if ($c -match "export interface SalesReturnResult") {
    Write-Host "X SalesReturnResult belonged to the removed path and is still here" -ForegroundColor Red
    exit 1
}
Write-Host "+ the unreachable return path and its five private helpers are gone" -ForegroundColor Green

# -- 2. the LIVE path must survive intact --------------------------------
# prepareSalesReturnData is reached from accounting-transaction-service via a
# relative dynamic import - the shape that fooled a hand search in 868. It
# calls prepareReturnJournal, and it uses SalesReturnItem. All three stay.
foreach ($keep in @("export async function prepareSalesReturnData",
                    "async function prepareReturnJournal",
                    "export interface SalesReturnItem")) {
    if ($c -notmatch [regex]::Escape($keep)) {
        Write-Host "X the live path lost: $keep" -ForegroundColor Red
        Write-Host "  Sales returns run through this. Deleting by position instead of by" -ForegroundColor Red
        Write-Host "  dependency takes the living half with the dead one." -ForegroundColor Red
        exit 1
    }
}
if ($c -notmatch [regex]::Escape("await prepareReturnJournal(supabase")) {
    Write-Host "X prepareSalesReturnData no longer calls prepareReturnJournal" -ForegroundColor Red; exit 1
}
Write-Host "+ the live path and everything it depends on is intact" -ForegroundColor Green

# -- 3. nothing outside the file referenced the removed exports ----------
$refs = git grep -l -e "processSalesReturn" -e "SalesReturnResult" -- app lib 2>$null |
        Where-Object { $_ -ne $sr }
if ($refs) {
    Write-Host "X something still imports a removed export:" -ForegroundColor Red
    $refs | ForEach-Object { Write-Host "    $_" }
    exit 1
}
Write-Host "+ no code outside the file referenced the removed exports" -ForegroundColor Green

# -- 4. ground won must be pinned down -----------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 196;") {
    Write-Host "X the unchecked-writes baseline is not 196" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 201 -> 196" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.875.ps1" 2>$null

# -- 5. nothing staged beyond this release (the 872 lesson) -------------
$expected = @($files) + @("push_v3.74.875.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        Write-Host "  Left over from an earlier run. Unstage it or add it to `$files." -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_876.txt"
    $msgLines = @(
        'chore(ledger): v3.74.876 - a journal entry with no branch, and a result nobody reads',
        '',
        'lib/sales-returns.ts carried two parallel sales-return paths. One is live:',
        'prepareSalesReturnData, reached from accounting-transaction-service through',
        'a relative dynamic import and used by the approvals flow. The other,',
        'processSalesReturn, is reached by nothing, and it took five private helpers',
        'with it.',
        '',
        'It was not merely dormant. processReturnAccounting builds a journal entry',
        'like this:',
        '',
        '    .from(journal_entries).insert({ company_id, reference_type, ... })',
        '',
        'with no branch_id - a NOT NULL column. It fails the first time it is ever',
        'called. And then it does not look:',
        '',
        '    const { data: journalEntry } = await ...',
        '    if (journalEntry) { ...everything to do with the ledger... }',
        '',
        'So the failure is swallowed, the entire accounting half is skipped, and the',
        'function returns a credit amount as though it worked. Anyone wiring this up',
        'later would get sales returns with no ledger effect, reported as success.',
        '',
        'It never broke a build because it never ran. Certain failure, plus silence,',
        'plus never executing - all three together are what make it a mine rather',
        'than dead code. Any one of them alone is survivable.',
        '',
        'Removed by dependency, not by position: I mapped which function calls which',
        'inside the file first. Five helpers are called only by the dead path and',
        'went with it. prepareReturnJournal is called by the LIVE path and stayed.',
        'SalesReturnResult belonged only to the removed export and went;',
        'SalesReturnItem is used by the live path and stayed - five usages checked',
        'one at a time rather than assumed.',
        '',
        '678 lines gone, the reason kept at the top of the file. 201 -> 196.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.876 pushed - a journal entry with no branch, and a result nobody reads" -ForegroundColor Green
}
