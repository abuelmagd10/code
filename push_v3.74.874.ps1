$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.874 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.873.ps1") { Remove-Item -LiteralPath "push_v3.74.873.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.874"') {
    Write-Host "+ 3.74.874" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.874]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.874]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$so    = "app/sales-orders/page.tsx"
$po    = "app/purchase-orders/page.tsx"
$cash  = "lib/sales-return-cash-disbursement.ts"
$vou   = "lib/services/customer-voucher-command.service.ts"
$cpay  = "lib/services/customer-payment-command.service.ts"
$brw   = "lib/services/bill-receipt-workflow.service.ts"
$inv   = "app/invoices/[id]/page.tsx"
$bedit = "app/bills/[id]/edit/page.tsx"
$ccs   = "lib/currency-conversion-system.ts"
$uw    = "scripts/check-unchecked-writes.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $so, $po, $cash, $vou, $cpay, $brw, $inv, $bedit, $ccs, $uw,
           "push_v3.74.874.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. a financial document must not be deleted unchecked ----------------
# Both order pages deleted the linked draft invoice/bill WITHOUT checking,
# then deleted the order itself (checked). A silent failure on the first
# left the order gone and the invoice orphaned - a document with no source,
# still counted in customer/supplier balances and in every report.
$soc = Get-Content -LiteralPath $so -Raw
$poc = Get-Content -LiteralPath $po -Raw
if ($soc -cmatch [regex]::Escape('await supabase.from("invoices").delete()')) {
    Write-Host "X the sales-order page still deletes its invoice unchecked" -ForegroundColor Red; exit 1
}
if ($poc -cmatch [regex]::Escape('await supabase.from("bills").delete()')) {
    Write-Host "X the purchase-order page still deletes its bill unchecked" -ForegroundColor Red; exit 1
}
foreach ($pair in @(@($soc, "تعذّر حذف الفاتورة المرتبطة"), @($poc, "تعذّر حذف فاتورة الشراء المرتبطة"))) {
    if ($pair[0] -notmatch [regex]::Escape($pair[1])) {
        Write-Host "X a cascade delete can still lose the order and keep the document" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ no financial document is deleted without checking the result" -ForegroundColor Green

# -- 2. cash left the till, so the receivable must move -------------------
$cc = Get-Content -LiteralPath $cash -Raw
if ($cc -notmatch "CASH_REFUND_PAID_AMOUNT_UPDATE_FAILED") {
    Write-Host "X a cash refund can still leave receivables overstated in silence" -ForegroundColor Red; exit 1
}
Write-Host "+ a cash refund cannot silently leave the receivable overstated" -ForegroundColor Green

# -- 3. rollback paths report, never throw --------------------------------
# ⚠️ The first version of this check scanned 200 characters AFTER the marker
# for the word "throw", and it fired on bill-receipt-workflow - wrongly. The
# throw it found was the USER-FACING error that follows the rollback on
# purpose ("this bill went back for approval"), not a throw out of the
# rollback itself. A window that wide cannot tell the two apart.
#
# So the question is asked precisely instead: is this marker the argument of
# a throw, or of a console.error? Look BACKWARD a short distance - if the
# marker is preceded by `throw new Error(` it is being raised; if by
# `console.error(` it is being reported. Nothing after it matters.
foreach ($pair in @(@($vou,  "VOUCHER_ROLLBACK_INVOICE_RESTORE_FAILED"),
                    @($cpay, "PAYMENT_ROLLBACK_VOID_FAILED"),
                    @($brw,  "BILL_RECEIPT_ROLLBACK_FAILED"))) {
    $t = Get-Content -LiteralPath $pair[0] -Raw
    $i = $t.IndexOf($pair[1])
    if ($i -lt 0) {
        Write-Host "X $($pair[0]) still unwinds in silence ($($pair[1]))" -ForegroundColor Red; exit 1
    }
    $from = [Math]::Max(0, $i - 60)
    $before = $t.Substring($from, $i - $from)
    if ($before -match "throw new Error\(") {
        Write-Host "X $($pair[0]) RAISES its rollback failure - it would mask the original error" -ForegroundColor Red
        exit 1
    }
    if ($before -notmatch "console\.(error|warn)\(") {
        Write-Host "X $($pair[0]): $($pair[1]) is neither logged nor recognisably reported" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ every rollback reports with its ids and masks nothing" -ForegroundColor Green

# -- 4. a snapshot that cannot be recomputed must stop the operation ------
# The pre-conversion amounts have no other source once the conversion runs.
$cs = Get-Content -LiteralPath $ccs -Raw
if ($cs -notmatch "CURRENCY_ORIGINAL_SNAPSHOT_FAILED") {
    Write-Host "X a currency conversion can still lose the original amounts silently" -ForegroundColor Red; exit 1
}
if ($cs -notmatch "CURRENCY_RESET_LINES_FAILED") {
    Write-Host "X the currency reset can still report success having done nothing" -ForegroundColor Red; exit 1
}
Write-Host "+ the irreversible snapshot stops the operation instead of logging" -ForegroundColor Green

# -- 5. the stale-status writes no longer pretend to be caught ------------
foreach ($pair in @(@($bedit, "BILL_STATUS_RECOMPUTE_FAILED"),
                    @($inv,   "INVOICE_CUSTOMER_SNAPSHOT_BACKFILL_FAILED"))) {
    $t = Get-Content -LiteralPath $pair[0] -Raw
    if ($t -notmatch $pair[1]) {
        Write-Host "X $($pair[0]) is missing $($pair[1])" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ try/catch around supabase no longer stands in for a real check" -ForegroundColor Green

# -- 6. ground won must be pinned down ------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 211;") {
    Write-Host "X the unchecked-writes baseline is not 211" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 224 -> 211" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.873.ps1" 2>$null

# -- 7. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.873.ps1")
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_874.txt"
    $msgLines = @(
        'fix(money): v3.74.874 - the order is deleted and its invoice survives',
        '',
        'Asked to order the remaining work by importance, I measured it instead of',
        'ranking by count. Of 224 unchecked writes, 21 touch money, and only 10 of',
        'those sit on a path people actually use - the rest are in repair tools no',
        'page calls, or inside a dead function. The count alone would have ordered',
        'the work wrong.',
        '',
        'The sharpest one: both order pages delete the linked draft invoice or bill',
        'WITHOUT checking, then delete the order itself, checked. If the first fails',
        'quietly - an RLS policy, a foreign key, anything - the order is gone and the',
        'invoice remains: a document with no source, still counted in customer and',
        'supplier balances and in every report that reads them. In any cascading',
        'delete, check every level and stop at the first failure. A partial delete is',
        'worse than none.',
        '',
        'The rest, each with what it was hiding:',
        '',
        '  cash refund       cash left the till and paid_amount was not reduced,',
        '                    so receivables stayed overstated',
        '  voucher rollback  the invoice stayed settled by money never booked',
        '  payment rollback  a phantom payment survived the failure that created it',
        '  receipt rollback  a bill looked "sent to the warehouse" while it had gone',
        '                    back to the approvals queue',
        '  bill status       stayed "sent" after being paid, so it would be chased',
        '                    for money already received',
        '  currency reset    reported success having changed nothing',
        '  currency snapshot the pre-conversion amounts were lost, and there is no',
        '                    second source for them - so that one throws rather than',
        '                    logs. Whatever cannot be recomputed later does not',
        '                    belong on a path that records and moves on.',
        '',
        'Four of the ten sat inside try/catch. supabase-js RETURNS { error } and',
        'never throws, so the catch could not fire and the result was dropped. That',
        'is the fifth release in which this exact shape has turned up: every try',
        'around a supabase call is a broken promise until error is read.',
        '',
        'Zero unchecked money writes remain on any live path. 224 -> 211.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.874 pushed - the order is deleted and its invoice survives" -ForegroundColor Green
}
