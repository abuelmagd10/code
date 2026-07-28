$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.875 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.874.ps1") { Remove-Item -LiteralPath "push_v3.74.874.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.875"') {
    Write-Host "+ 3.74.875" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.875]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.875]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$tomb  = "app/api/fix-inventory/route.ts"
$gone1 = "app/api/restore-invoice/route.ts"
$gone2 = "app/api/auto-fix-remaining-payments/route.ts"
$gone3 = "app/admin/auto-fix-payments/page.tsx"
$uw    = "scripts/check-unchecked-writes.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $tomb, $uw, "push_v3.74.875.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the button goes before the endpoint -------------------------------
# A dangerous endpoint with no button needs intent to reach. A dangerous
# button needs one misclick.
foreach ($f in @($gone1, $gone2, $gone3)) {
    if (Test-Path -LiteralPath $f) { Write-Host "X $f is still on disk" -ForegroundColor Red; exit 1 }
    $t = git ls-files -- $f
    if ($t) { Write-Host "X $f is still tracked by git" -ForegroundColor Red; exit 1 }
}
Write-Host "+ the admin button and the two unreferenced tools are gone" -ForegroundColor Green

# -- 2. fix-inventory keeps a headstone, not a deletion -------------------
# Two integration tests and two CI steps point at this route. The project's
# own convention (v3.74.773) is to leave a file that explains itself and
# preserves the security contract: auth is checked FIRST, so an anonymous
# caller still gets 401 rather than 410.
$tb = Get-Content -LiteralPath $tomb -Raw
if ($tb -notmatch "retired") {
    Write-Host "X fix-inventory was not retired" -ForegroundColor Red; exit 1
}
if ($tb -match "createClient") {
    Write-Host "X fix-inventory still opens a database client - the body was not removed" -ForegroundColor Red
    exit 1
}
$authIdx = $tb.IndexOf("requireOwnerOrAdmin(request)")
$goneIdx = $tb.IndexOf("status: 410")
if ($authIdx -lt 0 -or $goneIdx -lt 0 -or $authIdx -gt $goneIdx) {
    Write-Host "X the 401-before-410 security contract is not preserved" -ForegroundColor Red
    Write-Host "  tests/integration/api-security.test.ts expects 401 for an anonymous caller." -ForegroundColor Red
    exit 1
}
Write-Host "+ fix-inventory is a headstone that still answers 401 before 410" -ForegroundColor Green

# -- 3. CI must still pass its own greps on the headstone -----------------
# Two CI steps fail the build if fix-inventory uses NextResponse.json for an
# error ON ONE LINE. The headstone spreads the call over several lines, the
# same shape repair-invoice has carried since 773 - but assert it rather
# than assume it.
$flat = (Get-Content -LiteralPath $tomb) | Where-Object { $_ -match "NextResponse\.json.*error" }
if ($flat) {
    Write-Host "X the headstone trips the CI NextResponse.json check" -ForegroundColor Red
    exit 1
}
Write-Host "+ the headstone passes the CI error-shape greps" -ForegroundColor Green

# -- 4. ground won must be pinned down ------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 201;") {
    Write-Host "X the unchecked-writes baseline is not 201" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 211 -> 201" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git rm -q --cached -- $gone1 $gone2 $gone3 2>$null
git add -u -- "push_v3.74.874.ps1" 2>$null

# -- 5. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.874.ps1", $gone1, $gone2, $gone3)
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_875.txt"
    $msgLines = @(
        'chore(tools): v3.74.875 - a button that deletes two healthy payments and reports success',
        '',
        'The most dangerous of the three repair tools was the one wired to a page.',
        '',
        'auto-fix-remaining-payments treats every NEGATIVE payment as corrupt data',
        'and either deletes it or converts it to a sales return. Production holds two',
        'negative payments. Both are correct, both carry a journal entry, and the',
        'system created both itself: a pre-shipment refund reversal, and a supplier',
        'payment correction - through the very paths we have been hardening.',
        '',
        'A negative payment is no longer corruption. It is how a reversal is',
        'recorded. The tool is not broken; it was built for a data shape that no',
        'longer exists. Before running any repair tool, ask whether the definition it',
        'was built on still holds.',
        '',
        'Pressed today it would HARD-delete both - not soft-void - leaving their',
        'journal entries orphaned, and then report success, because the delete and',
        'the invoice update discard their results. It would also create a sales',
        'return with no journal entry, no COGS and no FIFO: a document the books',
        'know nothing about.',
        '',
        'The other two I measured before judging:',
        '',
        '    restore-invoice   rebuilds an invoice from an orphaned journal entry.',
        '                      Orphaned entries in production: 0.',
        '    fix-inventory     repairs missing stock movements. Genuine cases: 0.',
        '                      The single candidate is a SERVICE invoice - one',
        '                      service line, no products. No goods, nothing to move.',
        '                      The endpoint excluded services in eight places, so it',
        '                      knew that too.',
        '',
        'Both also collide with protections added after they were written:',
        'restore-invoice updates reference_id on a POSTED entry, fix-inventory',
        'deletes a posted COGS entry and its lines. The database refuses both, and',
        'because the writes are unchecked the refusal is swallowed and success is',
        'announced. Any tool older than the guard around it has to be re-read, not',
        'left alone.',
        '',
        'Retired following the projects own convention from 773: leave a headstone',
        'where something points at the route, delete outright where nothing does.',
        'fix-inventory keeps a file that explains itself and checks auth FIRST, so an',
        'anonymous caller still gets 401 rather than 410 - that contract is what the',
        'integration tests assert. restore-invoice and auto-fix-remaining-payments',
        'had zero references and are gone.',
        '',
        'The admin page went with the endpoint. A dangerous endpoint with no button',
        'needs intent to reach; a dangerous button needs one misclick.',
        '',
        '211 -> 201.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.875 pushed - a button that deletes two healthy payments and reports success" -ForegroundColor Green
}
