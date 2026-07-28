$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.871 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.870.ps1") { Remove-Item -LiteralPath "push_v3.74.870.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.871"') {
    Write-Host "+ 3.74.871" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.871]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.871]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$mig1 = "supabase/migrations/20260728000004_v3_74_871_vendor_credit_journal_via_gate.sql"
$sbal = "lib/supplier-balance.ts"
$uw   = "scripts/check-unchecked-writes.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $mig1, $sbal, $uw, "push_v3.74.871.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the vendor-credit journal must go through the gate -----------------
# Proven by experiment before the fix: creating a vendor credit was refused
# outright with DIRECT_POST_BLOCKED, because the trigger wrote journal rows
# itself. That is why vendor_credits had zero rows even after 865 cleared
# its phantom column - two defects in a row on one path.
$m1 = Get-Content -LiteralPath $mig1 -Raw
if ($m1 -notmatch "create_journal_entry_atomic") {
    Write-Host "X migration 1 does not route the journal through the gate" -ForegroundColor Red; exit 1
}
if ($m1 -notmatch "VENDOR_CREDIT_NO_AP_ACCOUNT") {
    Write-Host "X a missing AP account would still pass the credit through with no journal" -ForegroundColor Red
    Write-Host "  A credit note with no entry claims money the books know nothing about." -ForegroundColor Red
    exit 1
}
Write-Host "+ the vendor-credit journal routes through the atomic gate and fails loudly" -ForegroundColor Green

# -- 2. accounts resolve by type, not by a loose name match ----------------
# The loose rule matched "رصيد العملاء الدائن" (a CUSTOMER account) for
# accounts payable, because the supplier account name does not contain the
# word it searched for. The entry balanced perfectly on the wrong account.
#
# ⚠️ This fix was applied in two steps, and the release script refused the
# first attempt because migration 1 then described a body the live function
# no longer had. A migration file is a record of what the database SHOULD be,
# not a diary of attempts - a fresh database built from these files must land
# on the final state, never pass through one we already know is wrong. So the
# two steps are merged into one file. The story stays in the CHANGELOG.
if ($m1 -notmatch "accounts_payable") {
    Write-Host "X the migration does not resolve AP by sub_type" -ForegroundColor Red; exit 1
}
foreach ($n in @("ORDER BY account_code", "account_type = 'liability'", "account_type = 'asset'")) {
    if ($m1 -notmatch [regex]::Escape($n)) {
        Write-Host "X the migration is missing: $n" -ForegroundColor Red
        Write-Host "  Unordered LIMIT 1 is not reproducible, and an unconstrained name match picks the wrong side." -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ accounts resolve by sub_type, with a type-constrained ordered fallback" -ForegroundColor Green

# -- 3. the retraction must be recorded where the claim was made -----------
# I told the owner the trigger hard-codes two wrong account codes. It does
# not, and I never read that from the database. A wrong claim is corrected
# in writing, not quietly dropped.
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch "لا يستعمل أرقاماً ثابتة إطلاقاً") {
    Write-Host "X the false hard-coded-accounts claim is not retracted" -ForegroundColor Red; exit 1
}
# Match a phrase that lives on ONE line: the handover wraps its prose, so
# "ولا يُكمَل من الذاكرة" is split across a newline and would never match -
# the check would have failed for a reason that has nothing to do with the
# thing it guards.
$hv = Get-Content -LiteralPath "docs/HANDOVER_2026-07-24.md" -Raw
if ($hv -notmatch "يُعاد الاستعلام") {
    Write-Host "X the handover does not record the rule that caused it" -ForegroundColor Red; exit 1
}
Write-Host "+ the retraction and the rule behind it are both written down" -ForegroundColor Green

# -- 4. supplier-balance: the unsafe amount rewrite is gone ----------------
# The vendor-credit journal is created BEFORE INSERT only. Rewriting
# total_amount afterwards leaves the entry on the old figure - a document
# saying one number while the books say another. The module now reports the
# difference instead of silently restating it.
$sb = Get-Content -LiteralPath $sbal -Raw
if ($sb -cmatch [regex]::Escape("update({ total_amount: creditAmount })")) {
    Write-Host "X supplier-balance still rewrites a posted credit's amount" -ForegroundColor Red; exit 1
}
foreach ($n in @("amountDiffersFromOpenCredit", "VENDOR_CREDIT_INSERT_FAILED", "supplier_overpayment")) {
    if ($sb -notmatch $n) {
        Write-Host "X supplier-balance is missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ supplier-balance reports a differing amount instead of restating it" -ForegroundColor Green

# -- 5. ground won must be pinned down -------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 224;") {
    Write-Host "X the unchecked-writes baseline is not 224" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 226 -> 224" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.870.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_871.txt"
    $msgLines = @(
        'fix(ledger): v3.74.871 - a loose condition is more dangerous than no condition',
        '',
        'A retraction first, and it is the most important line in this release.',
        '',
        'I told the owner that the vendor-credit trigger hard-codes two wrong account',
        'codes and would post purchase returns to intangible assets. That was false.',
        'I never read it from the database. A call returned nothing, I filled the gap',
        'from my own head, and I presented invention in the shape of a measurement -',
        'after a full day of insisting on measurement over assumption.',
        '',
        'The rule I now hold myself to: no text is reported about the database unless',
        'it comes from a query result visible in an actual reply. If the reply is',
        'missing, re-run the query. Do not continue from memory.',
        '',
        'Then I measured, and found two real defects instead.',
        '',
        'First: a vendor credit could not be created at all. I created one inside a',
        'rolled-back transaction and the database refused it - DIRECT_POST_BLOCKED.',
        'The trigger writes journal rows directly, and the integrity gate requires',
        'create_journal_entry_atomic. The trigger predates the gate and was never',
        'updated. That explains the zero rows even after 865 cleared the phantom',
        'column: two defects in a row on one path, the second only visible once the',
        'first was gone. Fixing a defect on a dead path does not make the path work.',
        'Re-run it end to end after every fix.',
        '',
        'Second, and it only surfaced after fixing the first: the entry posted, and',
        'it balanced perfectly - on the wrong account.',
        '',
        '    1140 Inventory                Cr 100.00   correct',
        '    2155 Customer credit balance  Dr 100.00   a CUSTOMER account',
        '',
        'The AP lookup was sub_type = accounts_payable OR name LIKE %دائن%, with an',
        'unordered LIMIT 1. The supplier account is named "الموردين", which does not',
        'contain that word - while "رصيد العملاء الدائن" does. The OR made all',
        'candidates equal and storage order picked the customer one.',
        '',
        'A loose condition is more dangerous than no condition. Without it you get a',
        'visible failure. With it you get success on the wrong account - and a',
        'balanced entry passes every balance check there is. Only reading both sides',
        'of it reveals anything.',
        '',
        'And sub_type was correct all along: accounts_payable, inventory, vat_input',
        'are all populated properly. The loose fallback was not covering a gap. It',
        'was destroying precision that already existed.',
        '',
        'Input VAT carried the same flaw: %ضريب% matches output VAT too, so a',
        'purchase-tax reversal could have landed on the sales-tax account. Every name',
        'match is now constrained by account_type and ordered by account_code, because',
        'an unordered LIMIT 1 is not a reproducible result.',
        '',
        'Verified by re-running the same probe, with tax this time:',
        '',
        '    2110 الموردين                        Dr 114.00',
        '    1140 المخزون                                    Cr 100.00',
        '    1160 VAT - input                                Cr  14.00',
        '    posted, branch set, difference 0.00',
        '',
        'Rolled back. 0 credits, 126 entries, trial balance 0.0000.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.871 pushed - a loose condition is more dangerous than no condition" -ForegroundColor Green
}
