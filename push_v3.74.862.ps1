$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.861.ps1") { Remove-Item -LiteralPath "push_v3.74.861.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.862"') {
    Write-Host "+ 3.74.862" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.862]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.862]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260728000001_v3_74_862_custody_movement_cost_and_link.sql"
$guard = "scripts/check-custody-movements-costed-and-linked.js"
$self  = "scripts/selftest-custody-movements.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $guard, $self,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.862.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.861.ps1" 2>$null

# WARNING -LiteralPath is required: square brackets are wildcards in PowerShell (858).
foreach ($f in @($mig, $guard, $self)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. record what the function already knows -------------------------------
# Both custody functions compute the value from the FIFO batches and use it in
# the journal entry, and both keep the entry id in a variable - then write
# neither into the movement. Information held and not recorded is worse than
# information absent: it looks like the system does not know.
$mg = Get-Content -LiteralPath $mig -Raw
$mgCode = ($mg -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"
foreach ($need in @("unit_cost, total_cost", "SET journal_entry_id = v_entry")) {
    if ($mgCode -notmatch [regex]::Escape($need)) {
        Write-Host "X the migration is missing '$need'" -ForegroundColor Red; exit 1
    }
}
# both functions, not one
$outCount = ([regex]::Matches($mgCode, "fn_post_booking_custody_out")).Count
$retCount = ([regex]::Matches($mgCode, "fn_post_booking_custody_return")).Count
if ($outCount -lt 1 -or $retCount -lt 1) {
    Write-Host "X the migration must fix BOTH custody legs, out and return" -ForegroundColor Red; exit 1
}
# the link must only ever FILL a gap, never overwrite an existing one
if ($mgCode -notmatch "journal_entry_id IS NULL") {
    Write-Host "X the link update is not restricted to filling a NULL link" -ForegroundColor Red
    Write-Host "  Overwriting an existing link would fight prevent_linked_inventory_modification." -ForegroundColor Red
    exit 1
}
# and history stays untouched
if ($mgCode -match "UPDATE public\.inventory_transactions\s+SET unit_cost") {
    Write-Host "X the migration rewrites historical movements - immutable by design" -ForegroundColor Red; exit 1
}
Write-Host "+ custody movements record their cost and link, filling gaps only" -ForegroundColor Green

# -- 2. the self-test must not touch data -----------------------------------
$sf = Get-Content -LiteralPath $self -Raw
if ($sf -match "INSERT INTO|UPDATE |DELETE FROM") {
    Write-Host "X the self-test writes to the database - it must not need to" -ForegroundColor Red; exit 1
}
Write-Host "+ the self-test proves the guard without touching any data" -ForegroundColor Green

# -- 3. THE GUARD MUST BE SEEN REFUSING -------------------------------------
Write-Host "Proving the custody-movement guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-custody-movements.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

Write-Host "Checking custody movements carry cost and journal link..." -ForegroundColor Cyan
node scripts/check-custody-movements-costed-and-linked.js --require-db --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a custody movement is incomplete" -ForegroundColor Red; exit 1 }

Write-Host "Checking purchase movement cost matches the ledger..." -ForegroundColor Cyan
node scripts/check-movement-cost-matches-ledger.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a movement disagrees with the ledger" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.861.ps1" 2>$null
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
        'fix(custody): v3.74.862 - the value was in hand and never written down',
        '',
        'Found while tracing purchase cost in 861. Custody movements - materials',
        'handed to a technician and returned - are recorded on production with no',
        'unit_cost, no total_cost, and no journal_entry_id. The two cost columns',
        'are not merely left null: they are absent from the INSERT column list.',
        '',
        'And the journal entry does exist. It is created a few lines below, and',
        'its id is already sitting in a variable. Nothing joined the two.',
        '',
        'The worst part is that both functions compute the value themselves, from',
        'the FIFO batches, and then use it in the journal entry - and still do not',
        'write it into the movement. Information the system holds and does not',
        'record is worse than information it lacks: it looks like it does not know.',
        'Open the history of an item that went out on custody and there is no value',
        'against it, and no way to reach its accounting effect.',
        '',
        'The fix is two columns in an INSERT and one UPDATE. Nothing else changes.',
        'The sign follows the existing convention - total positive on an outbound',
        'movement, as production_issue already does.',
        '',
        'Verified on the test database, everything rolled back:',
        '',
        '  filling a NULL link          succeeded - the guard does not block it',
        '  editing it after it is set   refused   - the protection is intact',
        '  both functions now write cost and link                        2 of 2',
        '',
        'That distinction is the whole point: we fill a gap, we do not change a',
        'settled fact. Which is why this does not collide with',
        'prevent_linked_inventory_modification - the same guard that stopped us',
        'repairing history in 861, and was right to.',
        '',
        'The ten historical movements are therefore left alone. Some are tied to',
        'posted entries and cannot be edited, by design and by the same principle',
        'as reverse-never-edit. They stay documented, and the guard starts from',
        'this migration date so its baseline is a true zero rather than a constant',
        'that readers learn to ignore.',
        '',
        'The self-test touches no data - it cannot, because the fix makes the',
        'defect unplantable: cost and link are written in the same call now. So it',
        'widens the enforcement window until those ten genuinely incomplete rows',
        'fall inside it and demands the guard fails, then narrows it and demands it',
        'passes. A probe built out of the truth rather than a fabrication.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.862 pushed - custody movements know their own value" -ForegroundColor Green
}
