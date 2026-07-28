$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.870 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.869.ps1") { Remove-Item -LiteralPath "push_v3.74.869.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.870"') {
    Write-Host "+ 3.74.870" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.870]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.870]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$guard = "scripts/check-ledger-landmines.js"
$uw    = "scripts/check-unchecked-writes.js"
$gone1 = "lib/services/sales-invoice-edit-command.service.ts"
$gone2 = "lib/api-security-governance.ts"
$kept  = "lib/supplier-balance.ts"
$live  = "lib/services/sales-invoice-update-command.service.ts"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $guard, $uw, "push_v3.74.870.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the two duplicates are gone, the live one is not -------------------
foreach ($f in @($gone1, $gone2)) {
    if (Test-Path -LiteralPath $f) { Write-Host "X $f was not deleted" -ForegroundColor Red; exit 1 }
}
if (-not (Test-Path -LiteralPath $live)) {
    Write-Host "X the LIVE invoice-update service is gone - the wrong file was deleted" -ForegroundColor Red
    exit 1
}
Write-Host "+ the duplicate and the Express-era module are gone, the live service is intact" -ForegroundColor Green

# -- 2. nothing may still reference them -----------------------------------
# Verified before deleting; verified again here, because a deletion that
# leaves a dangling import turns a dead file into a broken build.
# ⚠️ $env:GIT_LITERAL_PATHSPECS = "1" is set at the top of this script, which
# turns OFF globbing in pathspecs. A pathspec of "*.ts" would then match
# nothing at all and this check could never fail - a guard incapable of
# refusing. Directory prefixes are literal and work correctly, so scope by
# directory instead. scripts/ is deliberately excluded: the landmine guard
# names both deleted modules in its baseline comment, on purpose.
$refs = git grep -l -e "sales-invoice-edit-command" -e "SalesInvoiceEditCommandService" `
                    -e "api-security-governance"    -e "SecureQueryBuilder" -- app lib 2>$null
if ($refs) {
    Write-Host "X something still imports a deleted module:" -ForegroundColor Red
    $refs | ForEach-Object { Write-Host "    $_" }
    exit 1
}
Write-Host "+ no code references either deleted module" -ForegroundColor Green

# -- 3. the survivor is kept ON PURPOSE, and the reason is written down ----
# supplier-balance is not surplus code - it is a MISSING FEATURE. Its
# customer-side twin is live and creates a credit when an invoice is
# overpaid; nothing does that for suppliers, and nothing stops a bill from
# being overpaid either. Deleting it would have buried the gap.
if (-not (Test-Path -LiteralPath $kept)) {
    Write-Host "X supplier-balance was deleted - that buries a missing feature" -ForegroundColor Red; exit 1
}
$gc = Get-Content -LiteralPath $guard -Raw
if ($gc -notmatch "ميزةً ناقصة") {
    Write-Host "X the baseline does not record WHY supplier-balance is kept" -ForegroundColor Red
    Write-Host "  Dead code and a missing feature look identical to every measurement." -ForegroundColor Red
    exit 1
}
if ($gc -notmatch [regex]::Escape("LEDGER_LANDMINE_BASELINE ?? 1")) {
    Write-Host "X the landmine baseline was not tightened to 1" -ForegroundColor Red; exit 1
}
Write-Host "+ the survivor is kept deliberately, with the reason recorded" -ForegroundColor Green

# -- 4. ground won must be pinned down -------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 226;") {
    Write-Host "X the unchecked-writes baseline is not 226" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 227 -> 226" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -A -- $files $gone1 $gone2 2>&1 | Out-Null
git add -u -- "push_v3.74.869.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_870.txt"
    $msgLines = @(
        'chore(cleanup): v3.74.870 - checking before deleting saved a missing feature from burial',
        '',
        'I put the three ledger landmines to the owner. He chose "check the supplier',
        'balance one first, then delete" - the slower option. It changed the outcome.',
        '',
        'Two were deleted.',
        '',
        '  sales-invoice-edit-command.service.ts is a duplicate of the LIVE',
        '  sales-invoice-update-command.service.ts that the invoice edit screen',
        '  actually uses. Its danger was never its existence - it was the',
        '  resemblance: two services for one job, and someone wires the wrong one.',
        '',
        '  api-security-governance.ts is written Express-style, (req, res). It',
        '  cannot run under the Next.js App Router at all. A fossil.',
        '',
        'Before deleting I swept the whole tree - ts, tsx, js, json, md, yml across',
        'app, lib, scripts, tests, docs and .github - for both filenames and every',
        'symbol they export. Zero code references. Deleting without that sweep is',
        'guessing.',
        '',
        'The third stays, and this is the part worth keeping.',
        '',
        'supplier-balance.ts is not surplus code. It is a MISSING FEATURE. Its',
        'customer-side twin is live: customer-balance.ts is called from the invoice',
        'screen and creates a credit when a customer overpays. Nothing does that for',
        'suppliers - and nothing stops a bill from being overpaid either. No check',
        'constraint, no trigger, nothing. Deleting it would have buried the gap under',
        'the word "cleanup".',
        '',
        'Dead code and a missing feature look identical to every measurement I have.',
        'The only question that separates them is whether the other side has a',
        'working counterpart. It stays visible in the landmine baseline, with the',
        'reason written there, until it is either wired up or dropped on purpose.',
        '',
        'One more thing, found while writing the release script. Check 2 used a',
        'pathspec of "*.ts" while GIT_LITERAL_PATHSPECS=1 is set at the top of the',
        'same file, which disables globbing - so the pattern would have matched',
        'nothing and the check could never have failed. A guard incapable of',
        'refusing. Scoped by directory instead.',
        '',
        'Landmines 3 -> 1. Unchecked writes 227 -> 226, by deletion rather than',
        'repair; the counter does not distinguish, and it should not.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.870 pushed - checking before deleting saved a missing feature from burial" -ForegroundColor Green
}
