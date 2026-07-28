$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.869 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.868.ps1") { Remove-Item -LiteralPath "push_v3.74.868.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.869"') {
    Write-Host "+ 3.74.869" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.869]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.869]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$reach  = "scripts/lib-reachability.js"
$guard  = "scripts/check-ledger-landmines.js"
$selft  = "scripts/selftest-ledger-landmines.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $reach, $guard, $selft, "package.json", ".github/workflows/ci.yml",
           "push_v3.74.869.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the analyser must see BOTH shapes I got wrong ----------------------
# 865: my search excluded .tsx.  868: it missed await import("./...").
# Both errors called live code dead, which understates impact - the worse
# direction to be wrong in.
$rc = Get-Content -LiteralPath $reach -Raw
if ($rc -notmatch [regex]::Escape('import\s*\(')) {
    Write-Host "X the analyser does not follow dynamic imports (the 868 miss)" -ForegroundColor Red; exit 1
}
if ($rc -notmatch [regex]::Escape('base + ".tsx"')) {
    Write-Host "X the analyser does not resolve .tsx (the 865 miss)" -ForegroundColor Red; exit 1
}
Write-Host "+ the reachability analyser follows dynamic imports and resolves .tsx" -ForegroundColor Green

# -- 2. it must declare which way it errs ----------------------------------
# A measurement of financial or security impact has to say whether its number
# is a floor or a ceiling.
if ($rc -notmatch "لا تصف الحىَّ ميتاً") {
    Write-Host "X the analyser does not declare its direction of conservatism" -ForegroundColor Red; exit 1
}
Write-Host "+ the analyser declares the direction in which it errs" -ForegroundColor Green

# -- 3. the landmine guard, with named findings not a bare number ----------
$gc = Get-Content -LiteralPath $guard -Raw
if ($gc -notmatch "LEDGER_LANDMINE_BASELINE") {
    Write-Host "X the landmine guard has no overridable baseline for its selftest" -ForegroundColor Red; exit 1
}
foreach ($n in @("sales-invoice-edit-command.service.ts", "supplier-balance.ts", "api-security-governance.ts")) {
    if ($gc -notmatch [regex]::Escape($n)) {
        Write-Host "X the baseline does not name $n - a bare number teaches its reader to ignore it" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ the landmine baseline names every finding behind the number" -ForegroundColor Green

# -- 4. the selftest proves the analyser, not only the guard ---------------
$sc = Get-Content -LiteralPath $selft -Raw
foreach ($n in @("ROUTE_DYNAMIC", "ROUTE_ALIAS", "needle")) {
    if ($sc -notmatch $n) { Write-Host "X the selftest is missing $n" -ForegroundColor Red; exit 1 }
}
Write-Host "+ the selftest proves both import shapes and names its probe" -ForegroundColor Green

# -- 5. wired into npm and CI ----------------------------------------------
foreach ($pair in @(@("package.json"), @(".github/workflows/ci.yml"))) {
    $t = Get-Content -LiteralPath $pair[0] -Raw
    if ($t -notmatch "check:ledger-landmines") {
        Write-Host "X $($pair[0]) does not run the landmine guard" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the landmine guard runs in npm and in CI" -ForegroundColor Green

# -- 6. the two corrections must be recorded, not quietly dropped ----------
# I overstated a PUBLIC-policy warning in 867 and called a live module dead
# in 868. Both retractions belong in the changelog.
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch "٧٦٤ من ٧٩٤") {
    Write-Host "X the 867 PUBLIC-policy warning is not retracted with its measurement" -ForegroundColor Red; exit 1
}
if ($cl -notmatch "استيرادٌ ديناميكىٌّ نسبى") {
    Write-Host "X the 868 dead-code claim is not corrected" -ForegroundColor Red; exit 1
}
Write-Host "+ both retractions are recorded with the measurement behind them" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.868.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_869.txt"
    $msgLines = @(
        'fix(tooling): v3.74.869 - twice wrong with a hand-rolled search means the tool is at fault',
        '',
        'Two retractions first.',
        '',
        'In 867 I warned that three policies target PUBLIC. Then I measured: 764 of',
        '794 target PUBLIC. It is the norm here, not the anomaly, and the three I',
        'flagged are conditioned on auth.uid() exactly like 761 others. Only seven',
        'are genuinely open - USING (true), no condition - and all seven are already',
        'in the documented allow-list in check-anon-open-tables. Warning withdrawn.',
        'Had I built a guard on that warning it would have fired on 764 findings,',
        'which is the noise that killed the phantom-column tool in 863. A number',
        'that looks alarming alone is not a finding until it is measured against',
        'the norm.',
        '',
        'In 868 I called lib/sales-returns.ts dead code. Half of it is live:',
        'prepareSalesReturnData is called from accounting-transaction-service through',
        'await import(./sales-returns) - a relative dynamic import my search for',
        '@/lib/... could not see. Only processSalesReturn is unreachable.',
        '',
        'So: two errors in two days on the same question, "is this reachable?", both',
        'calling live code dead. 865 missed .tsx files; 868 missed dynamic relative',
        'imports. Both understated the impact, which is the worse direction to be',
        'wrong in - it reassures. After being wrong twice, "I will be more careful"',
        'is not an answer. A measurement that does not depend on my attention is.',
        '',
        'scripts/lib-reachability.js builds the real import graph from every page,',
        'route and layout, following alias, relative and dynamic imports plus',
        're-exports, resolving .ts, .tsx and /index. It states in its own header',
        'which way it errs: it measures modules, not functions, so it may call dead',
        'code live but never live code dead. Any tool measuring financial or security',
        'impact should say whether its number is a floor or a ceiling.',
        '',
        'On top of it, check-ledger-landmines.js: a module no route can reach that',
        'writes to the ledger. Nothing else reports this class - it never runs, so it',
        'never fails, and it is never fixed alongside the rest. The proof is already',
        'here: processReturnAccounting builds a journal entry with no branch_id, a',
        'NOT NULL column. It fails the instant it is called. It has never broken a',
        'build.',
        '',
        'Three exist, and the baseline names each one rather than stating a bare',
        'count, because a constant with nothing behind it trains its reader to skip',
        'the line. The worst is sales-invoice-edit-command.service.ts: an entire',
        'sales-invoice edit service touching journal entries, stock movements and',
        'payments, wired to nothing.',
        '',
        'The guard does not delete and does not forbid existence. It forbids growth.',
        'Deleting is the owner decision, not the tool.',
        '',
        'The selftest proves the analyser, not just the guard: it plants the ledger',
        'writer, then connects it once by relative dynamic import and once by static',
        'alias, and requires the guard to fall silent both times - the two shapes I',
        'got wrong. A fourth probe, unreachable but touching nothing financial, must',
        'never be reported.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.869 pushed - twice wrong with a hand-rolled search means the tool is at fault" -ForegroundColor Green
}
