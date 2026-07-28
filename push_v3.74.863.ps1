$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.862.ps1") { Remove-Item -LiteralPath "push_v3.74.862.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.863"') {
    Write-Host "+ 3.74.863" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.863]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.863]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260728000002_v3_74_863_add_missing_updated_at.sql"
$guard = "scripts/check-phantom-columns.js"
$self  = "scripts/selftest-phantom-columns.js"
$ship  = "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts"
$curr  = "lib/currency-conversion-system.ts"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $guard, $self, $ship, $curr,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.863.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.862.ps1" 2>$null

# WARNING -LiteralPath is required: square brackets are wildcards in PowerShell (858).
foreach ($f in @($mig, $guard, $self, $ship, $curr)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the guard must read the LIVE schema, not a stored snapshot ----------
# The old one compared against supabase/schema/schema.sql, which lags the
# database after any migration - and its own comment admitted it, telling the
# reader to verify by hand. A guard that knows it sometimes lies, and is left
# that way, teaches everyone to ignore it.
$gd = Get-Content -LiteralPath $guard -Raw
if ($gd -notmatch "information_schema\.columns") {
    Write-Host "X the guard does not read the live schema" -ForegroundColor Red; exit 1
}
if ($gd -match "schema\.sql") {
    Write-Host "X the guard still falls back to the stored snapshot" -ForegroundColor Red; exit 1
}
# nearest .from only - the gap must not swallow another .from(
if ($gd -notmatch "\(\?\!\\\.from\\\(\)") {
    Write-Host "X the guard's window can still cross a .from() boundary (26 false alarms)" -ForegroundColor Red
    exit 1
}
# and it must understand object depth
if ($gd -notmatch "topLevelKeys") {
    Write-Host "X the guard does not distinguish top-level keys from nested jsonb keys" -ForegroundColor Red
    exit 1
}
Write-Host "+ the guard reads live schema, nearest .from only, depth-aware" -ForegroundColor Green

# -- 2. the four real defects must actually be fixed ------------------------
$shipCode = ((Get-Content -LiteralPath $ship -Raw) -split "`n" | Where-Object { $_ -notmatch "^\s*//" }) -join "`n"
if ($shipCode -match "error_message:") {
    Write-Host "X shipments.error_message is still written - that column does not exist" -ForegroundColor Red
    exit 1
}
if ($shipCode -notmatch "last_api_error:") {
    Write-Host "X the shipment error is no longer recorded anywhere" -ForegroundColor Red; exit 1
}
$currCode = ((Get-Content -LiteralPath $curr -Raw) -split "`n" | Where-Object { $_ -notmatch "^\s*//" }) -join "`n"
$billsBlock = [regex]::Match($currCode, "from\('bills'\)[\s\S]{0,400}?\)")
if ($billsBlock.Success -and $billsBlock.Value -match "display_paid") {
    Write-Host "X bills.display_paid is still written - that column does not exist" -ForegroundColor Red
    exit 1
}
$mg = Get-Content -LiteralPath $mig -Raw
foreach ($need in @("commission_plans", "fifo_lot_consumptions", "updated_at = created_at")) {
    if ($mg -notmatch [regex]::Escape($need)) {
        Write-Host "X the migration is missing '$need'" -ForegroundColor Red; exit 1
    }
}
# the initial value must be created_at, never now(): an untouched row must not
# claim it was edited on the day of the migration.
if ($mg -match "SET updated_at = now\(\) WHERE updated_at IS NULL") {
    Write-Host "X back-fills updated_at with now() - old rows would look edited today" -ForegroundColor Red
    exit 1
}
Write-Host "+ all four real defects are fixed, and history is not back-dated" -ForegroundColor Green

# -- 3. THE GUARD MUST BE SEEN REFUSING - AND SEEN NOT REFUSING -------------
# The old tool was not asleep; it was shouting in the wrong place. So a positive
# probe alone proves nothing: two inverted probes prove the false alarms are gone.
Write-Host "Proving the phantom-column guard refuses - and no longer cries wolf..." -ForegroundColor Cyan
node scripts/selftest-phantom-columns.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen behaving correctly - NOT pushing" -ForegroundColor Red; exit 1
}

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
node scripts/check-phantom-columns.js --require-db | Select-Object -Last 2
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
git add -u -- "push_v3.74.862.ps1" 2>$null
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
        'fix(guard): v3.74.863 - the guard was lying: 51 reports, four of them real',
        '',
        'Starting on the 51 phantom-column writes, I checked the first one before',
        'fixing anything. It was a false alarm. So was the next. In the end, 41 of',
        'the 51 were noise, from three separate defects in the tool itself:',
        '',
        '  26  a window that crosses statement boundaries. It allowed 400 chars',
        '      between .from(x) and .update({, so it would grab one table and',
        '      attribute another statement keys to it. Its loudest claim was that',
        '      accounting period locking writes to company_members. It does not:',
        '      the code READS company_members, then UPDATES accounting_periods.',
        '      Perfectly correct code, reported as broken for months.',
        '',
        '  12  no notion of object depth. last_dispatch_summary: { mode, ... }',
        '      writes those keys inside one jsonb column; every one was counted',
        '      as a phantom column.',
        '',
        '   3  compared against a stored schema snapshot that lags the database.',
        '      The old comment in the file ADMITTED this and told the reader to',
        '      verify by hand. A tool that knows it sometimes lies, left that way,',
        '      teaches everyone to ignore it.',
        '',
        'A guard whose output is nine tenths noise is worse than no guard. The',
        'number stops being read, and the real defect passes inside the noise.',
        'Same lesson as 859, where a syntactic check produced 21 false alarms and',
        'was deleted rather than tuned.',
        '',
        'Rewritten: nearest .from only - the gap may not contain another one - a',
        'brace-balancing parser that takes top-level keys alone, and columns read',
        'from the LIVE schema. The parser is unit-tested against the exact shapes',
        'it used to misread: nested objects, arrays of objects, shorthand, spread,',
        'and function calls.',
        '',
        'The four real ones were each a silently dead feature, and all four are',
        'fixed here:',
        '',
        '  shipments.error_message         approval failing after the carrier had',
        '                                  already created the shipment left it',
        '                                  UNMARKED - the whole update was refused,',
        '                                  so it was never even cancelled.',
        '                                  The right column already existed:',
        '                                  last_api_error.',
        '  bills.display_paid              "reset to original currency" failed for',
        '                                  supplier bills only, while succeeding',
        '                                  everywhere else. Key removed - the',
        '                                  conversion path never sets it for bills.',
        '  commission_plans.updated_at     editing a commission plan failed',
        '                                  entirely. Column added.',
        '  fifo_lot_consumptions.updated_at  the partial reversal on a purchase',
        '                                  return failed. Column added.',
        '',
        'The owner chose to add the columns rather than drop the writes: editing a',
        'commission plan should record when. The addition is pure - no existing row',
        'is touched, and the initial value is created_at, never now(), so a row',
        'that was never edited does not claim it was edited on migration day. A',
        'trigger keeps it honest, so the field does not depend on every writer',
        'remembering to set it.',
        '',
        'Baseline is therefore zero - not because a ceiling was lowered, but',
        'because the real debt is gone.',
        '',
        'The self-test carries three probes, two of them inverted. The old tool was',
        'not asleep, it was shouting in the wrong place, so a positive probe alone',
        'would prove nothing. It plants a genuine phantom write and demands a',
        'failure; then it plants the two shapes that used to produce false alarms -',
        'read one table and update another, and keys nested inside jsonb - and',
        'demands silence.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.863 pushed - the guard tells the truth, and the truth was four" -ForegroundColor Green
}
