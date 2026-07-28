$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec, and this release
# touches several dynamic Next.js routes ("[id]"). Literal pathspecs turn
# that off for every git call below. (Same family as the 858 PowerShell
# lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.878 - the OLD script is removed, never this one. Three releases in a
# row a chained string-replace turned this line into self-deletion (861, 865,
# 866). A replacement whose output can match its own next pattern is not a
# replacement, it is a loop. This line is now written by hand.
if (Test-Path -LiteralPath "push_v3.74.877.ps1") { Remove-Item -LiteralPath "push_v3.74.877.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.878"') {
    Write-Host "+ 3.74.878" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.878]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.878]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$helper = "lib/audit-log-write.ts"
$uw     = "scripts/check-unchecked-writes.js"
$touched = @(
  "app/api/accept-invite/route.ts",
  "app/api/accept-membership/route.ts",
  "app/api/backup/[id]/route.ts",
  "app/api/backup/export-excel/route.ts",
  "app/api/backup/export/route.ts",
  "app/api/backup/restore/route.ts",
  "app/api/billing/cancel-invite/route.ts",
  "app/api/billing/renew/route.ts",
  "app/api/bills/[id]/confirm-receipt/route.ts",
  "app/api/bills/[id]/restart-approval-notifications/route.ts",
  "app/api/bonuses/attach-to-payroll/route.ts",
  "app/api/bonuses/reverse/route.ts",
  "app/api/bonuses/settings/route.ts",
  "app/api/commissions/advance-payments/pay/route.ts",
  "app/api/cron/backup-daily/route.ts",
  "app/api/cron/ensure-accounting-periods/route.ts",
  "app/api/cron/expire-permission-shares/route.ts",
  "app/api/cron/subscription-renewal/route.ts",
  "app/api/employee-bonus-configs/route.ts",
  "app/api/fixed-assets/auto-post-depreciation/route.ts",
  "app/api/hr/attendance/anomalies/route.ts",
  "app/api/hr/attendance/route.ts",
  "app/api/hr/attendance/shifts/route.ts",
  "app/api/hr/employees/route.ts",
  "app/api/hr/payroll/payments/route.ts",
  "app/api/init-missing-company-tables/route.ts",
  "app/api/payments/[id]/resubmit-after-reject/route.ts",
  "app/api/send-invite/route.ts",
  "app/inventory/write-offs/page.tsx",
  "app/invoices/[id]/page.tsx",
  "app/settings/page.tsx",
  "lib/billing/subscription-service.ts",
  "lib/currency-service.ts",
  "lib/refund-policy-engine.ts",
  "lib/services/bill-receipt-workflow.service.ts",
  "lib/services/bonus-calculator.service.ts",
  "lib/services/bonus-reversal.service.ts",
  "lib/services/purchase-return-command.service.ts",
  "lib/services/sales-invoice-warehouse-command.service.ts"
)

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $helper, $uw) + $touched + @("push_v3.74.878.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the helper must NOT throw ----------------------------------------
# A failed audit line does not invalidate work that succeeded. Voiding a
# correct edit because its log row would not write punishes the user for a
# defect that is not theirs. It reports instead - with table, action, id.
$h = Get-Content -LiteralPath $helper -Raw
if ($h -match "throw ") {
    Write-Host "X writeAuditLog throws - a failed log would void a successful operation" -ForegroundColor Red
    exit 1
}
if ($h -notmatch "AUDIT_LOG_WRITE_FAILED") {
    Write-Host "X writeAuditLog fails in silence" -ForegroundColor Red; exit 1
}
Write-Host "+ the helper reports without voiding the operation it logs" -ForegroundColor Green

# -- 2. no file may still insert an audit row by hand ---------------------
# Two files write to DIFFERENT audit tables - payment_audit_logs and
# refund_audit_logs - so they do not use the audit_logs helper. They were
# fixed inline instead, and are checked by their own markers below.
$inline = @{
  "app/api/payments/[id]/resubmit-after-reject/route.ts" = "PAYMENT_AUDIT_ATTRIBUTION_FAILED"
  "lib/refund-policy-engine.ts"                          = "REFUND_AUDIT_LOG_FAILED"
}
foreach ($f in $touched) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'from\("audit_logs"\)\s*\r?\n?\s*\.?insert' -or
        $c -match "from\('audit_logs'\)\s*\r?\n?\s*\.?insert") {
        Write-Host "X $f still inserts an audit row directly" -ForegroundColor Red; exit 1
    }
    if ($inline.ContainsKey($f)) {
        if ($c -notmatch $inline[$f]) {
            Write-Host "X $f writes another audit table and still reports nothing" -ForegroundColor Red
            exit 1
        }
    } elseif ($c -notmatch "audit-log-write") {
        Write-Host "X $f does not import the shared helper" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ every audit write is either helper-routed or reports inline" -ForegroundColor Green

# -- 3. ground won must be pinned down ------------------------------------
$uwc = Get-Content -LiteralPath $uw -Raw
if ($uwc -notmatch "const BASELINE = 113;") {
    Write-Host "X the unchecked-writes baseline is not 113" -ForegroundColor Red; exit 1
}
Write-Host "+ unchecked-writes baseline tightened 165 -> 113" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.877.ps1" 2>$null

# -- 4. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.877.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_878.txt"
    $msgLines = @(
        'refactor(audit): v3.74.878 - a try around supabase is a broken promise',
        '',
        'Of the fifty sites writing to the audit trail, thirty-nine sat inside a',
        'try/catch. That is worse than no handling at all, because it looks like',
        'handling:',
        '',
        '    try { await admin.from("audit_logs").insert({ ... }) } catch { }',
        '',
        'supabase-js RETURNS { error } and never throws. The catch cannot fire, and',
        'the result is dropped. Silent twice over - the guard does not work, and the',
        'wound is not visible.',
        '',
        'This exact shape has now turned up in six consecutive releases today: 865,',
        '868, 871, 874, 877 and this one. It is the single most repeated defect in',
        'the codebase. Look for try around a supabase call FIRST, not last.',
        '',
        'lib/audit-log-write.ts, on the same method as rollback-journal-entry (756,',
        'six sites) and financial-trace (877, thirty-one). When a shape repeats three',
        'times the shared function is not a refinement - it is the only fix from',
        'which no site gets forgotten.',
        '',
        'It does NOT throw. A failed audit line does not invalidate work that',
        'succeeded: voiding a correct governance edit because its log row would not',
        'write punishes the user for a defect that is not theirs. It logs the table,',
        'the action, the id and the company, so the source is known without hunting.',
        '',
        'The rewrite caught a bug in itself. The automatic import inserter placed the',
        'line INSIDE a multi-line import in two files, because it looked for the last',
        'line starting with "import" - which was the opening line of a spanning',
        'import. It broke both files, the syntax check caught it immediately, and',
        'they were fixed by hand. "Last line starting with X" is not "end of the last',
        'statement", and an automated rewrite needs a syntax check right after it,',
        'not after the push.',
        '',
        'Two more found on the way: payment_audit_logs, whose failure leaves a',
        'resubmission attributed to nobody, and a function literally named',
        'createAuditLog that never checked whether it had created anything.',
        '',
        '165 -> 113. No silent audit write remains anywhere.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.878 pushed - a try around supabase is a broken promise" -ForegroundColor Green
}
