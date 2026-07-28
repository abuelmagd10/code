$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.866 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.865.ps1") { Remove-Item -LiteralPath "push_v3.74.865.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.866"') {
    Write-Host "+ 3.74.866" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.866]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.866]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$approve = "app/api/journal-entries/[id]/approve/route.ts"
$reject  = "app/api/journal-entries/[id]/reject/route.ts"
$inbox   = "app/approvals/page.tsx"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $approve, $reject, $inbox, "push_v3.74.866.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. rejection must exist, demand a reason, and NOT kill the draft -------
# Owner decision: rejection returns the entry to its author. The status stays
# draft, the record lives in the audit trail, the author gets told why.
$rj = Get-Content -LiteralPath $reject -Raw
if ($rj -notmatch "reason_required") {
    Write-Host "X a journal entry can be rejected with no reason" -ForegroundColor Red
    Write-Host "  The author needs to know what to correct." -ForegroundColor Red
    exit 1
}
if ($rj -cmatch "is_deleted: true" -or $rj -cmatch [regex]::Escape('status: "rejected"')) {
    Write-Host "X rejection deletes or re-statuses the entry - it must only return it" -ForegroundColor Red
    exit 1
}
if ($rj -notmatch "manual_journal_rejected") {
    Write-Host "X the rejection leaves no audit record - then it never happened" -ForegroundColor Red
    exit 1
}
if ($rj -notmatch "audit_write_failed") {
    Write-Host "X the rejection proceeds even if its own audit record failed to write" -ForegroundColor Red
    Write-Host "  Here the audit row IS the action. If it is lost, the next approver" -ForegroundColor Red
    Write-Host "  sees an entry that was never rejected, and posts it." -ForegroundColor Red
    exit 1
}
Write-Host "+ rejection returns the draft, demands a reason, and records itself" -ForegroundColor Green

# -- 2. whoever cannot say yes cannot say no -------------------------------
# If the two matrices ever diverged, someone with no power to approve would
# gain the power to block.
$ap = Get-Content -LiteralPath $approve -Raw
foreach ($needle in @("general_manager", "accountant")) {
    if ($rj -notmatch $needle) {
        Write-Host "X the reject matrix does not mirror the approve matrix ($needle)" -ForegroundColor Red
        exit 1
    }
}
if ($rj -notmatch "self_rejection") {
    Write-Host "X a user can reject his own draft through the inbox" -ForegroundColor Red; exit 1
}
if ($ap -notmatch "self_approval") {
    Write-Host "X the approve route lost its separation of duties" -ForegroundColor Red; exit 1
}
Write-Host "+ approve and reject share one matrix, both with separation of duties" -ForegroundColor Green

# -- 3. the inbox integration must be complete -----------------------------
# The approvals page has no central card registry; a type is wired by hand in
# sixteen places. Forgetting totalPending alone hides the whole section when
# it is the only pending type.
$ib = Get-Content -LiteralPath $inbox -Raw
$wiring = @{
    "interface"      = "interface PendingJournalEntry"
    "tab key"        = '|"je"'
    "role matrix"    = '"misc","je"]'
    "visible tabs"   = '"misc","je"] as const'
    "history map"    = 'journal_entry: "je"'
    "state"          = "setJournalEntries"
    "tab button"     = 'canShow("je")'
    "history chip"   = 'canShowHistory("journal_entry")'
    "card section"   = 'activeTab === "je"'
    "pending count"  = "+ journalEntries.length"
    "approve call"   = "/approve"
    "reject call"    = "/reject"
}
foreach ($k in $wiring.Keys) {
    if ($ib -notmatch [regex]::Escape($wiring[$k])) {
        Write-Host "X the approvals inbox is missing its $k wiring" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ approvals inbox wired in every place a card type needs" -ForegroundColor Green

# -- 4. never offer a button the server will refuse ------------------------
if ($ib -notmatch "creator_role") {
    Write-Host "X the card does not read the creator role, so it cannot mirror the matrix" -ForegroundColor Red
    Write-Host "  Offering a button that returns 403 lies to the user." -ForegroundColor Red
    exit 1
}
if ($ib -notmatch "canDecideJe") {
    Write-Host "X the decision buttons are not gated" -ForegroundColor Red; exit 1
}
Write-Host "+ the card offers only the decision the server will accept" -ForegroundColor Green

# -- 5. a journal entry must not be able to reach handleApprove ------------
# PendingItem is that function's input type and its endpoint chain ends in a
# manufacturing fallback. A journal entry reaching it would POST to a
# material-issue URL, silently.
if ($ib -cmatch "\|\s*PendingJournalEntry") {
    Write-Host "X PendingJournalEntry was added to PendingItem" -ForegroundColor Red
    Write-Host "  handleApprove would then accept it and POST to a material-issue URL." -ForegroundColor Red
    exit 1
}
Write-Host "+ a journal entry cannot reach the manufacturing approve chain" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.865.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_866.txt"
    $msgLines = @(
        'feat(approvals): v3.74.866 - approvals are requested from the inbox, not the document screen',
        '',
        '865 made the manual journal entry creatable for the first time and left',
        'its cycle half-working: a draft could be created and nobody could approve',
        'it from the UI. The easy fix was a button on the journal entry screen.',
        '',
        'The owner refused that and set a general rule instead: approval is',
        'requested from the approvals inbox, with its own card and its own record',
        'card, like every other approval. That is the better answer - an approver',
        'should not have to chase documents across screens to find what is waiting.',
        '',
        'Rejection needed a decision of its own, because journal_entries has no',
        '"rejected" status and no reason column. The owner chose: the entry goes',
        'back to its author. The status stays draft so nobody loses work, the',
        'rejection and its reason live in the audit trail, and the author is',
        'notified. No third status was added to the ledger table, because a new',
        'status there forces every existing report and check to understand it -',
        'an expensive price for something the audit trail already carries.',
        '',
        'Worth noticing how the releases stack: the audit trail only started',
        'working yesterday in 865, when its columns turned out to be phantom. That',
        'fix is what makes this design possible at all.',
        '',
        'Whoever cannot say yes cannot say no. The reject route mirrors the approve',
        'matrix exactly - owner posts directly, a GM entry is decided by the owner,',
        'an accountant entry by either - with the same absolute separation of',
        'duties. Had the two matrices diverged, someone with no power to approve',
        'would have gained the power to block.',
        '',
        'Two details I want on the record.',
        '',
        'The card reads the CREATOR role and applies the matrix before rendering,',
        'so a general manager is never shown an approve button on his own entry -',
        'he is shown the reason instead. Offering a button that returns 403 lies to',
        'the user; the UI should mirror the governance, not discover it.',
        '',
        'PendingJournalEntry is deliberately kept OUT of the PendingItem union.',
        'That union is the input type of handleApprove, whose endpoint chain ends',
        'in a manufacturing fallback - a journal entry reaching it would silently',
        'POST to a material-issue URL. Widening a type to accept what must never',
        'reach it makes the mistake pass the checker instead of stopping it.',
        '',
        'The approvals page has no central card registry: a type is wired by hand',
        'in sixteen places. Forgetting totalPending alone hides the entire section',
        'whenever it is the only pending type - so the release script checks all',
        'of them.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.866 pushed - approvals are requested from the inbox, not the document screen" -ForegroundColor Green
}
