$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.863.ps1") { Remove-Item -LiteralPath "push_v3.74.863.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.864"') {
    Write-Host "+ 3.74.864" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.864]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.864]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$uw    = "scripts/check-unchecked-writes.js"
$cust  = "lib/services/customer-payment-command.service.ts"
$supp  = "lib/services/supplier-payment-command.service.ts"
$pre1  = "lib/pre-receipt-refund.ts"
$pre2  = "lib/pre-shipment-refund.ts"
$ref   = "lib/services/customer-refund-command.service.ts"
$vou   = "lib/services/customer-voucher-command.service.ts"

$files = @("lib/version.ts", "CHANGELOG.md", $uw, $cust, $supp, $pre1, $pre2, $ref, $vou,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.864.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.863.ps1" 2>$null

foreach ($f in @($uw, $cust, $supp, $pre1, $pre2, $ref, $vou)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the money-link writes must be checked, and fail loudly ---------------
# The journal entry is already posted at that moment. A silent failure leaves
# an entry for the money and a payment that does not know it.
foreach ($f in @($cust, $supp)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "PAYMENT_JOURNAL_LINK_FAILED") {
        Write-Host "X $f does not fail loudly when the payment/journal link is lost" -ForegroundColor Red
        exit 1
    }
}
$sc = Get-Content -LiteralPath $supp -Raw
if ($sc -notmatch "PAYMENT_ALLOCATION_UPDATE_FAILED") {
    Write-Host "X the payment/bill allocation update is still unchecked" -ForegroundColor Red; exit 1
}

# -- 2. the 252 guarantee must actually be enforced now ---------------------
# Both refund paths carry a comment from v3.74.252 saying the JE is posted only
# after every dependent write succeeded. That condition was never checked.
foreach ($f in @($pre1, $pre2)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "voidMarkError") {
        Write-Host "X $f still posts the JE without checking the void-mark write" -ForegroundColor Red
        Write-Host "  A comment describing a guarantee is not the guarantee." -ForegroundColor Red
        exit 1
    }
    if ($c -notmatch "postError") {
        Write-Host "X $f still posts the journal entry unchecked" -ForegroundColor Red; exit 1
    }
}

# -- 3. rollback paths report, they do not throw ----------------------------
# Throwing inside a catch would bury the original error that started the unwind.
foreach ($f in @($ref, $vou)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "ROLLBACK_PAYMENT_DELETE_FAILED") {
        Write-Host "X $f still deletes the payment silently while unwinding" -ForegroundColor Red; exit 1
    }
    $blk = [regex]::Match($c, "ROLLBACK_PAYMENT_DELETE_FAILED[\s\S]{0,200}")
    if ($blk.Success -and $blk.Value -match "throw ") {
        Write-Host "X $f throws from a rollback path - it would mask the original error" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ forward paths fail loudly, rollback paths report without masking" -ForegroundColor Green

# -- 4. the baseline may only ever fall -------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 260;") {
    Write-Host "X the unchecked-writes baseline is not 260" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 269 -> 260" -ForegroundColor Green

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

# 863 — this self-test must keep running: it proves the rebuilt guard both
# catches the real defect AND stays silent on the two shapes it used to misread.
Write-Host "Proving the phantom-column guard still tells the truth..." -ForegroundColor Cyan
node scripts/selftest-phantom-columns.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the phantom-column guard regressed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.863.ps1" 2>$null
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
        'fix(payments): v3.74.864 - a comment describing a guarantee is not the guarantee',
        '',
        'After 863, where the tool turned out to be lying, I audited this one before',
        'touching the debt. The opposite result: check-unchecked-writes is honest.',
        'It is unusually careful - it documents three of its own past bugs and',
        'fixes them, defaults every write to UNCHECKED and only excuses one on',
        'evidence. Three sites picked at random were all real. A tool gets audited,',
        'not accused; believing it after the audit is as much a part of the method',
        'as disbelieving the last one.',
        '',
        'Triaged the 269 by consequence rather than count: 63 touch money and the',
        'ledger, 32 are financial tracing, 71 are fire-and-forget logging that is',
        'meant to be that way, and 103 are operational. Closed the nine most',
        'dangerous - everything touching payments.',
        '',
        'Two of them stopped me cold. pre-receipt-refund and pre-shipment-refund',
        'both carry a comment from v3.74.252:',
        '',
        '    post the JE only after every dependent write succeeded',
        '',
        'The condition it describes was never checked. The dependent write - marking',
        'the original payment as voided - discarded its result, so the journal entry',
        'was posted whether or not it worked. A silent failure there leaves a refund',
        'recorded in the ledger while the original payment still looks live. And the',
        'posting itself was unchecked too: an entry left in draft while the refund',
        'reports success is money that moved outside the books.',
        '',
        'A comment describing a guarantee is not the guarantee. The difference only',
        'shows when you read the line underneath it.',
        '',
        'The distinction applied throughout:',
        '',
        '  forward path   throw. An inconsistent success is worse than an honest',
        '                 failure - the user can retry a failure.',
        '  rollback path  report with the ids, do not throw. Throwing inside a catch',
        '                 buries the original error that started the unwind. But it',
        '                 does not go quiet either.',
        '',
        'The payment/journal link errors name BOTH ids, so a lost link can be',
        'repaired by hand rather than hunted for.',
        '',
        'And the safety net was already in place: the ledger-integrity check from',
        '860 flags a posted payment with no journal entry, because the only',
        'documented exception is a rejected one. The code prevents it; the guard',
        'catches it if prevention ever fails.',
        '',
        '269 -> 260.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.864 pushed - a comment describing a guarantee is not the guarantee" -ForegroundColor Green
}
