$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.873 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.872.ps1") { Remove-Item -LiteralPath "push_v3.74.872.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.873"') {
    Write-Host "+ 3.74.873" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.873]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.873]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$mig   = "supabase/migrations/20260728000006_v3_74_873_vendor_credit_overpayment_treatment.sql"
$route = "app/api/supplier-payments/[id]/apply-bill/route.ts"
$guard = "scripts/check-ledger-landmines.js"
$selft = "scripts/selftest-ledger-landmines.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $mig, $route, $guard, $selft, "push_v3.74.873.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. overpayment must NOT be posted as a goods return -------------------
# The old entry was Dr AP / Cr Inventory for every credit note. Correct for a
# purchase return; for an overpayment it would reduce the company's stock in
# exchange for money paid twice - an inventory shortfall with no source.
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "supplier_overpayment") {
    Write-Host "X the migration does not branch on the credit reason" -ForegroundColor Red; exit 1
}
if ($m -notmatch "VENDOR_CREDIT_NO_SUPPLIER_ADVANCE_ACCOUNT") {
    Write-Host "X a missing supplier-advance account would pass silently" -ForegroundColor Red; exit 1
}
# The advance lookup must be constrained to an ASSET account: the sub_type on
# that account is literally named vendor_credit_liability in two companies,
# which is misleading, so account_type is what makes it safe.
if ($m -notmatch [regex]::Escape("account_type = 'asset'")) {
    Write-Host "X the advance account is not constrained to an asset" -ForegroundColor Red; exit 1
}
Write-Host "+ an overpayment is reclassified as a supplier advance, not a goods return" -ForegroundColor Green

# -- 2. the wiring belongs in the route, and must not break the payment ----
# The payment is valid whether or not the credit note gets created. Anything
# that is not a condition of correctness does not belong where it can void it.
$r = Get-Content -LiteralPath $route -Raw
if ($r -notmatch "syncVendorCredit") {
    Write-Host "X the overpayment credit is still not wired to the payment path" -ForegroundColor Red; exit 1
}
foreach ($n in @("SUPPLIER_OVERPAYMENT_CREDIT_FAILED",
                 "SUPPLIER_OVERPAYMENT_CREDIT_STALE",
                 "SUPPLIER_OVERPAYMENT_CREDIT_THREW")) {
    if ($r -notmatch $n) {
        Write-Host "X the wiring can fail in silence ($n)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ wired in the route, reports every failure, voids no payment" -ForegroundColor Green

# -- 3. the last landmine is gone, and the baseline says so ---------------
$gc = Get-Content -LiteralPath $guard -Raw
if ($gc -notmatch [regex]::Escape("LEDGER_LANDMINE_BASELINE ?? 0")) {
    Write-Host "X the landmine baseline was not tightened to 0" -ForegroundColor Red; exit 1
}
$sc = Get-Content -LiteralPath $selft -Raw
if ($sc -notmatch [regex]::Escape('LEDGER_LANDMINE_BASELINE: "0"')) {
    Write-Host "X the selftest still guards a baseline that no longer exists" -ForegroundColor Red; exit 1
}
Write-Host "+ ledger landmines 3 -> 1 -> 0, guard and selftest agree" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.872.ps1" 2>$null

# -- 4. nothing staged beyond this release (the 872 lesson) ---------------
$expected = @($files) + @("push_v3.74.872.ps1")
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_873.txt"
    $msgLines = @(
        'feat(ap): v3.74.873 - an overpayment is a supplier advance, not a goods return',
        '',
        'The credit-note trigger posted the same entry for every reason: Dr accounts',
        'payable, Cr inventory. Correct for a purchase return - goods came back, so',
        'stock falls. Wrong for an overpayment, where nothing came back. Wiring the',
        'overpayment path to it would have reduced the company inventory in exchange',
        'for money paid twice: a stock shortfall with no source.',
        '',
        'The right treatment is a reclassification. The extra payment already left a',
        'DEBIT balance sitting in accounts payable - the supplier now owes us. That',
        'does not belong in a liability account:',
        '',
        '    Dr  Advances to suppliers   the supplier owes us this',
        '    Cr  Accounts payable        the liability account returns to normal',
        '',
        'No tax line: an overpayment is neither a purchase nor a reversal of one.',
        '',
        'Both branches verified in one rolled-back transaction:',
        '',
        '    [return]      2110 Suppliers        Dr 114.00',
        '                  1140 Inventory                  Cr 100.00',
        '                  1160 VAT input                  Cr  14.00',
        '',
        '    [overpayment] 1180 Supplier advances Dr 250.00',
        '                  2110 Suppliers                  Cr 250.00',
        '',
        'Inventory is untouched in the second one, which is the whole point.',
        '',
        'The advance lookup is constrained to account_type = asset, because the',
        'sub_type on that account is literally named vendor_credit_liability in two',
        'of the five companies. The name lies; the type does not.',
        '',
        'syncVendorCredit is wired in the apply-bill ROUTE, not inside the payment',
        'command service. The service throws to void a payment, and the credit note',
        'is not a condition of the payment being correct - the payment is booked',
        'either way, and without the note the surplus simply stays in payables, less',
        'classified rather than wrong. Whatever is not a condition of correctness',
        'does not belong where it can invalidate it. It still does not go quiet:',
        'three named messages cover failure, a stale open credit, and an unexpected',
        'throw.',
        '',
        'Ledger landmines 3 -> 1 -> 0. The last one was not deleted, it was',
        'connected. Zero here means every piece of code that touches the ledger is',
        'reachable from some route, and a new one that is not will break the build.',
        '',
        'Also recorded: system log retention stays at 30 days. I had raised that',
        'question on the premise that no retention policy existed. It does -',
        'cleanup-system-logs has been running nightly at 02:00, which is why the',
        'oldest row is exactly 30 days old and the table size is flat. Raising it to',
        '90 would have TRIPLED the table, not shrunk it. Check cron.job before',
        'saying anything about a table growing.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.873 pushed - an overpayment is a supplier advance, not a goods return" -ForegroundColor Green
}
