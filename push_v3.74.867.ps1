$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.867 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.866.ps1") { Remove-Item -LiteralPath "push_v3.74.866.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.867"') {
    Write-Host "+ 3.74.867" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.867]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.867]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$snap    = "supabase/schema/schema.sql"
$guard   = "scripts/check-schema-snapshot-matches-db.js"
$selft   = "scripts/selftest-schema-snapshot-matches-db.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $snap, $guard, $selft, "package.json", ".github/workflows/ci.yml",
           "push_v3.74.867.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the four tables that lived only in production ----------------------
# One of them, journal_entry_lines_orphan_archive, I created myself in 860 -
# two days before writing the rule that a new object lives in two places.
# A rule with no guard is not a rule, it is an intention.
$sn = Get-Content -LiteralPath $snap -Raw
foreach ($t in @("casual_workers", "production_labour_payments",
                 "production_labour_payment_lines", "journal_entry_lines_orphan_archive")) {
    if ($sn -cnotmatch "CREATE TABLE IF NOT EXISTS public\.$t \(") {
        Write-Host "X the snapshot still has no $t block" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the four production-only tables are in the snapshot" -ForegroundColor Green

# -- 2. the snapshot must not have shrunk ----------------------------------
# A truncated export that still "succeeds" is worse than a hard failure: it
# becomes the trusted baseline while under-reporting what production holds.
$tables   = ([regex]::Matches($sn, "(?m)^CREATE TABLE")).Count
$policies = ([regex]::Matches($sn, "(?m)^CREATE POLICY")).Count
$cons     = ([regex]::Matches($sn, "ADD CONSTRAINT")).Count
Write-Host "  snapshot: $tables tables / $policies policies / $cons constraints" -ForegroundColor DarkGray
if ($tables -lt 253)   { Write-Host "X table count fell below 253"      -ForegroundColor Red; exit 1 }
if ($policies -lt 790) { Write-Host "X policy count fell below 790"     -ForegroundColor Red; exit 1 }
if ($cons -lt 1820)    { Write-Host "X constraint count fell below 1820" -ForegroundColor Red; exit 1 }
Write-Host "+ the snapshot grew, it did not shrink" -ForegroundColor Green

# -- 3. the guard must compare against the LIVE database -------------------
# The existing snapshot guard states in its own header that it cannot see a
# thing ADDED to the database and missing from the file. That is the exact
# direction in which four whole tables were lost.
$gc = Get-Content -LiteralPath $guard -Raw
if ($gc -notmatch "information_schema.columns") {
    Write-Host "X the new guard does not read the live schema" -ForegroundColor Red; exit 1
}
if ($gc -notmatch "SCHEMA_SNAPSHOT_PATH") {
    Write-Host "X the guard cannot be pointed at a temp copy - the selftest would have to edit the real file" -ForegroundColor Red
    exit 1
}
Write-Host "+ the guard reads the live database and can be redirected safely" -ForegroundColor Green

# -- 4. the selftest must name what it planted -----------------------------
# Measured only by exit code, a guard can be satisfied by breaking it (865).
$sc = Get-Content -LiteralPath $selft -Raw
if ($sc -notmatch "needle") {
    Write-Host "X the selftest would read a crash as a refusal" -ForegroundColor Red; exit 1
}
if ($sc -notmatch "the real snapshot changed during the selftest") {
    Write-Host "X the selftest does not verify it left the real snapshot untouched" -ForegroundColor Red; exit 1
}
Write-Host "+ the selftest names its probes and guarantees it touched nothing" -ForegroundColor Green

# -- 5. wired into npm and CI, not only into this script -------------------
$pkg = Get-Content -LiteralPath "package.json" -Raw
$ci  = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
foreach ($pair in @(@($pkg, "package.json"), @($ci, ".github/workflows/ci.yml"))) {
    if ($pair[0] -notmatch "check:schema-snapshot-db") {
        Write-Host "X $($pair[1]) does not run the new guard" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the guard runs in npm and in CI, not only here" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.866.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_867.txt"
    $msgLines = @(
        'fix(schema): v3.74.867 - a rule with no guard is not a rule, it is an intention',
        '',
        'In 865 I wrote the rule down: a new column lives in two places, the',
        'database and the snapshot, and both travel in one commit. Then instead of',
        'assuming I knew how far behind the snapshot was, I measured it.',
        '',
        'Seven columns, as expected. And four whole tables that existed only in',
        'production: casual_workers, production_labour_payments,',
        'production_labour_payment_lines, and journal_entry_lines_orphan_archive.',
        '',
        'I created that last one myself, by hand, in v3.74.860 - two days before',
        'writing the rule it breaks. So the rule was already broken, at the scale',
        'of an entire table, by the person who then wrote it down. A rule with no',
        'guard is not a rule. It is an intention, and I am the proof.',
        '',
        'A missing table is not a documentation gap. The snapshot carries 794 RLS',
        'policies, 523 triggers, 1827 constraints and every function grant. A table',
        'absent from it is a table whose entire security model is absent from the',
        'repository, and nothing reported it.',
        '',
        'The existing guard says why, in its own header:',
        '',
        '    It cannot detect a function ADDED to the database and missing from',
        '    the snapshot - that needs a live connection.',
        '',
        'That sentence has been sitting there since 759, and the breach happened in',
        'exactly the direction it names. Worth generalising: read every guard header',
        'for the phrase "does not check X" - that is a map of the next gaps.',
        '',
        'So check-schema-snapshot-matches-db.js compares the file against the live',
        'database: the set of tables, and each table column names and order, by md5.',
        'Not types or defaults - the generator writes those and comparing them',
        'textually produces noise, and a guard whose alarms are mostly noise is',
        'worse than none (863).',
        '',
        'Snapshot fingerprint and live fingerprint now agree exactly:',
        '03331982d1067e34cd0e634308722e2a.',
        '',
        'The regeneration diff is fully accounted for: four tables added, and the',
        'eleven policy changes are the v3.74.857 lockdown itself - the service_role',
        'blanket policies and the old pending_companies rules that release replaced.',
        'No table was dropped and no policy went missing unexplained.',
        '',
        'One thing I noticed and chased. Three of the newly-included tables carry',
        'SELECT policies targeting PUBLIC, which includes anon, and anon does hold',
        'a SELECT grant on them - the shape 857 was about. My first test showed anon',
        'seeing zero rows and proved nothing, because the tables are empty: that is',
        '"nothing to see", not "the policy refused". So I planted a row in each',
        'inside a rolled-back transaction and ran it again. Planted 1/1/1, anon sees',
        '0/0/0. The policies scope on auth.uid(), which is null for anon.',
        '',
        'Two production check constraints refused my probe rows along the way',
        '(chk_plp_paid_needs_account, chk_plpl_one_person). Both were right.',
        '',
        'The selftest never touches the real 1.5 MB tracked file: it works on a temp',
        'copy through SCHEMA_SNAPSHOT_PATH and verifies in finally that the original',
        'is byte-identical. It also requires each positive trap to find its own',
        'planted name in the output, so a crash cannot be read as a refusal (865).'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.867 pushed - a rule with no guard is not a rule, it is an intention" -ForegroundColor Green
}
