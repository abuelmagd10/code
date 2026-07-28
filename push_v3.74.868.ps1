$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.868 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.867.ps1") { Remove-Item -LiteralPath "push_v3.74.867.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.868"') {
    Write-Host "+ 3.74.868" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.868]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.868]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$uw    = "scripts/check-unchecked-writes.js"
$cash  = "lib/sales-return-cash-disbursement.ts"
$wo    = "app/api/write-offs/approve/route.ts"
$fifo  = "lib/purchase-return-fifo-reversal.ts"
$pre1  = "lib/pre-receipt-refund.ts"
$pre2  = "lib/pre-shipment-refund.ts"
$supp  = "lib/services/supplier-payment-command.service.ts"
$cbal  = "lib/customer-balance.ts"
$cref  = "lib/services/customer-refund-command.service.ts"
$vou   = "lib/services/customer-voucher-command.service.ts"
$srr   = "lib/services/supplier-refund-receipt-command.service.ts"
$vcred = "lib/purchase-returns-vendor-credits.ts"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $uw, $cash, $wo, $fifo, $pre1, $pre2, $supp, $cbal, $cref, $vou, $srr, $vcred,
           "push_v3.74.868.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. paying a customer in cash must settle his credit -------------------
# Otherwise he keeps a spendable credit for money already handed over.
$c = Get-Content -LiteralPath $cash -Raw
foreach ($n in @("CREDIT_LEDGER_NETTING_FAILED", "CREDIT_SETTLE_AFTER_CASH_REFUND_FAILED")) {
    if ($c -notmatch $n) { Write-Host "X $cash can still pay twice in silence ($n)" -ForegroundColor Red; exit 1 }
}
Write-Host "+ a cash refund cannot silently leave the credit spendable" -ForegroundColor Green

# -- 2. the ledger and the stock must not drift apart ----------------------
$c = Get-Content -LiteralPath $wo -Raw
if ($c -notmatch "WRITE_OFF_MOVEMENT_FAILED") {
    Write-Host "X a write-off can post its expense and never move the stock" -ForegroundColor Red; exit 1
}
$c = Get-Content -LiteralPath $fifo -Raw
if ($c -notmatch "FIFO_CONSUMPTION_REVERSAL_FAILED") {
    Write-Host "X a purchase return can restore the lot and leave FIFO double-counting" -ForegroundColor Red; exit 1
}
Write-Host "+ stock movements and FIFO reversals report their own failure" -ForegroundColor Green

# -- 3. a reversal that stays draft is not a reversal ----------------------
foreach ($f in @($pre1, $pre2)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "REVERSAL_POST_FAILED") {
        Write-Host "X $f can return a reversal id for an entry still in draft" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ a reversal is only reported once it is actually posted" -ForegroundColor Green

# -- 4. forward paths throw, rollback paths report -------------------------
$c = Get-Content -LiteralPath $supp -Raw
if ($c -notmatch "ADVANCE_APPLICATION_WRITE_FAILED") {
    Write-Host "X the advance/bill application can still vanish silently" -ForegroundColor Red; exit 1
}
foreach ($pair in @(@($cref, "REFUND_ROLLBACK_CREDIT_RESTORE_FAILED"),
                    @($vou,  "VOUCHER_ROLLBACK_ADVANCE_DELETE_FAILED"),
                    @($srr,  "SUPPLIER_REFUND_ROLLBACK_CREDIT_RESTORE_FAILED"),
                    @($vcred,"VENDOR_CREDIT_ROLLBACK_DELETE_FAILED"))) {
    $t = Get-Content -LiteralPath $pair[0] -Raw
    if ($t -notmatch $pair[1]) {
        Write-Host "X $($pair[0]) still unwinds in silence ($($pair[1]))" -ForegroundColor Red; exit 1
    }
    $blk = [regex]::Match($t, [regex]::Escape($pair[1]) + "[\s\S]{0,220}")
    if ($blk.Success -and $blk.Value -match "throw ") {
        Write-Host "X $($pair[0]) throws from a rollback path - it would mask the original error" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ forward paths fail loudly, rollback paths report without masking" -ForegroundColor Green

# -- 5. the correction to 865 must be written down, not quietly fixed ------
# I called this module unreachable in 865 because my search excluded .tsx.
# Its two callers are .tsx pages, so the defect was live and I understated it.
$c = Get-Content -LiteralPath $vcred -Raw
if ($c -notmatch "app/bills/page.tsx") {
    Write-Host "X the 865 reachability correction is not recorded in the file" -ForegroundColor Red
    Write-Host "  A wrong claim gets corrected where it was made." -ForegroundColor Red
    exit 1
}
Write-Host "+ the 865 misclassification is corrected in the code itself" -ForegroundColor Green

# -- 6. ground won must be pinned down -------------------------------------
$c = Get-Content -LiteralPath $uw -Raw
if ($c -notmatch "const BASELINE = 227;") {
    Write-Host "X the unchecked-writes baseline is not 227" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 247 -> 227" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.867.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_868.txt"
    $msgLines = @(
        'fix(money): v3.74.868 - a reachability search that excludes .tsx calls live code dead',
        '',
        'A correction first, because it is mine. In 865 I said the purchase-return',
        'vendor-credit function had no callers, so its phantom column had never hurt',
        'anyone. That was wrong. I searched with --include=*.ts and both callers are',
        '.tsx pages: app/bills/page.tsx and app/bills/[id]/page.tsx. The path is live',
        'and the defect was real - zero vendor credits in production despite actual',
        'purchase returns.',
        '',
        'An error that understates a defect is worse than one that overstates it. The',
        'second costs an unnecessary check; the first grants false reassurance. The',
        'correction is written into the file where the wrong claim was made, not only',
        'into the changelog.',
        '',
        'Then the work itself. Of the 227 unchecked writes, 33 touch the ledger or',
        'money. Rather than fixing them in the order they printed, I measured which',
        'were reachable - this time across .ts AND .tsx. Sixteen files live, two',
        'genuinely dead.',
        '',
        'What each silent failure was hiding:',
        '',
        '  cash refund settlement  the customer is paid in cash and keeps a',
        '                          spendable credit - the company pays twice',
        '  write-off movement      the expense posts, the stock never moves, and',
        '                          the GL and FIFO drift apart',
        '  FIFO reversal           the lot quantity is restored while the',
        '                          consumption row still claims it - double count',
        '  refund reversals        the reversing entry stays draft, touching no',
        '                          balance, and its id is returned as success',
        '  advance application     the payment posts, the advance looks unapplied',
        '  customer credit         returns success: true having failed',
        '',
        'Three of them sat inside try/catch. supabase-js RETURNS { error } and never',
        'throws, so the catch could not run and the result was discarded: silent',
        'twice over. One carried a comment promising the error would "surface so we',
        'notice if the schema drifts". It could never have surfaced.',
        '',
        'The 864 distinction throughout: forward path throws, rollback path reports',
        'with ids and never throws. Every message names the ids AND what the failure',
        'means, so whoever reads the log at night knows the consequence without',
        'opening the code.',
        '',
        '247 -> 227.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.868 pushed - a reachability search that excludes .tsx calls live code dead" -ForegroundColor Green
}
