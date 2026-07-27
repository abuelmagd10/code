$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.859.ps1") { Remove-Item -LiteralPath "push_v3.74.859.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.860"') {
    Write-Host "+ 3.74.860" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.860]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.860]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260727000006_v3_74_860_archive_orphan_journal_lines.sql"
$guard = "scripts/check-ledger-integrity.js"
$self  = "scripts/selftest-ledger-integrity.js"
$uw    = "scripts/check-unchecked-writes.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $guard, $self, $uw,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.860.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.859.ps1" 2>$null

# WARNING -LiteralPath is required: square brackets are wildcards in PowerShell (858).
foreach ($f in @($mig, $guard, $self, $uw)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. archive, never delete - and prove the move before removing anything --
# 733 lines whose parent entry AND whose account were both gone. Archiving is
# only safe if nothing can be deleted before the copy is proven, row for row
# and piastre for piastre, and if the healthy lines are counted before/after.
$mg = Get-Content -LiteralPath $mig -Raw
$mgCode = ($mg -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"
foreach ($need in @("journal_entry_lines_orphan_archive", "INSERT INTO public.journal_entry_lines_orphan_archive",
                    "RAISE EXCEPTION", "v_after_healthy")) {
    if ($mgCode -notmatch [regex]::Escape($need)) {
        Write-Host "X the migration is missing '$need'" -ForegroundColor Red; exit 1
    }
}
$insAt = $mgCode.IndexOf("INSERT INTO public.journal_entry_lines_orphan_archive")
$delAt = $mgCode.IndexOf("DELETE FROM public.journal_entry_lines l")
if ($insAt -lt 0 -or $delAt -lt 0 -or $delAt -lt $insAt) {
    Write-Host "X the migration deletes before it archives - STOP" -ForegroundColor Red; exit 1
}
# and the new archive table must be closed to anonymous visitors (857)
if ($mgCode -notmatch "REVOKE ALL ON public\.journal_entry_lines_orphan_archive FROM anon") {
    Write-Host "X the archive table is left reachable by anon" -ForegroundColor Red; exit 1
}
Write-Host "+ the migration archives before deleting, and the archive is closed to anon" -ForegroundColor Green

# -- 2. every ledger query must exclude soft-deleted entries -----------------
# Computing this by hand twice in one session produced the same phantom 22.69
# inventory gap twice, because is_deleted was forgotten both times.
$gd = Get-Content -LiteralPath $guard -Raw
if ($gd -notmatch "coalesce\(e\.is_deleted, false\) = false") {
    Write-Host "X the ledger check does not exclude soft-deleted entries" -ForegroundColor Red; exit 1
}
$sf = Get-Content -LiteralPath $self -Raw
# the inverted probe: a soft-deleted entry that touches nothing must add NO new
# failure. If the guard ever forgot is_deleted it would add one, and fail here.
if ($sf -notmatch "expectAdds: \[\]") {
    Write-Host "X the self-test has no inverted probe - is_deleted is not proven" -ForegroundColor Red; exit 1
}
# and it must measure the DELTA, not the absolute state: the test database
# carries real pre-existing debt (a 0.1419 ledger/FIFO gap), so an absolute
# assertion would fail for a reason that has nothing to do with the probe.
if ($sf -notmatch "baseFails") {
    Write-Host "X the self-test is not differential - pre-existing debt would break it" -ForegroundColor Red; exit 1
}
Write-Host "+ the ledger check honours is_deleted, and the self-test proves it" -ForegroundColor Green

# -- 3. THE GUARD MUST BE SEEN REFUSING -------------------------------------
# Three probes on the TEST database: an unbalanced entry, an orphan line, and
# an inverted one - an imbalance inside a soft-deleted entry, which must NOT
# be reported. 833, 845, 851, 853, 857, 858, 859 all shipped past sleeping guards.
Write-Host "Proving the ledger-integrity guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-ledger-integrity.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

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

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.859.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_859.txt"
    $msgLines = @(
        'fix(ledger): v3.74.860 - 733 journal lines were hanging in mid-air',
        '',
        'Moving on to the 269 database writes whose result is never checked, the',
        'owner chose the right method over the obvious one: rather than patching',
        '63 call sites, ask the database whether the books actually hang together.',
        '',
        'They do. Trial balance 0.0000. Every entry balances on its own. No posted',
        'document without its journal entry. Inventory in the ledger matches FIFO.',
        '',
        'But the same scan found 733 journal lines whose parent entry does not',
        'exist - 349 missing entries - and all 733 point at 40 accounts that do not',
        'exist either. They violate two validated foreign keys at once, which is',
        'impossible unless constraint enforcement was switched off during a bulk',
        'delete. The evidence points at a cleanup of a deleted company (the repo',
        'even ships a delete-non-vitaslims-users function); the cause is not',
        'asserted.',
        '',
        'Debit equals credit exactly - 2,363,266.08 each - so these are whole',
        'entries whose heads were removed, not stray rows. Dated 28 Nov 2025 to',
        '22 May 2026, and nothing new for over two months: the phenomenon stopped.',
        '',
        'They changed no number anyone sees: every report joins a line to its entry,',
        'so a line without one drops out. That is exactly why nobody noticed, and',
        'exactly why they were a trap for the next query that sums lines directly.',
        '',
        'Archived, not deleted, on the owner decision. Copied whole into',
        'journal_entry_lines_orphan_archive, then removed from the live table - in',
        'that order, inside one transaction. Nothing is deleted before the copy is',
        'proven row for row and piastre for piastre, and one final condition rolls',
        'everything back if the number of healthy lines changes at all. It did not:',
        '274 before, 274 after, trial balance still 0.0000, inventory still matched.',
        'The archive table is closed to anon and authenticated from its first day.',
        '',
        'And the reason the check exists at all, stated plainly: I computed the',
        'inventory gap by hand twice in one session and got it wrong both times, the',
        'same way both times - forgetting to exclude soft-deleted entries. Both',
        'times it produced the identical phantom figure, 22.69. As long as this is',
        're-derived by hand it will keep being derived wrong, by me included. So it',
        'is written once: check:ledger, eight checks, baseline zero, with the',
        'is_deleted condition built in.',
        '',
        'The self-test plants three probes on the test database. Two must be caught:',
        'an unbalanced entry, and an orphan line created the same way the 733 were -',
        'by disabling constraint enforcement. The third is inverted: an imbalance',
        'inside a soft-deleted entry, which the guard must NOT report. If the guard',
        'ever forgets is_deleted it fails that probe, so the mistake I made twice',
        'cannot be made by the guard itself.',
        '',
        'Also ratcheted the unchecked-writes baseline from 272 to 269 after the 858',
        'fixes removed three. Ground won is not given back.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.860 pushed - the books are proven to hang together" -ForegroundColor Green
}
