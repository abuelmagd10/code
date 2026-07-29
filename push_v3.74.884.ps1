$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.884 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.883.ps1") { Remove-Item -LiteralPath "push_v3.74.883.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.884"') {
    Write-Host "+ 3.74.884" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.884]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.884]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$invRoute  = "app/api/invoices/route.ts"
$soPage    = "app/sales-orders/page.tsx"
$shPage    = "app/shareholders/page.tsx"
$mig       = "supabase/migrations/20260729000001_v3_74_884_impossible_rollback_sites.sql"
$example   = "app/api/sales-orders/route.example.ts"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $invRoute, $soPage, $shPage, $mig,
           "scripts/check-impossible-rollback.js",
           "scripts/check-ledger-landmines.js",
           "scripts/check-unchecked-writes.js",
           "push_v3.74.884.ps1")

foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. the dead example file is gone, and nothing exempts it any more ----
if (Test-Path -LiteralPath $example) {
    Write-Host "X $example must be deleted - it was one of the four sites" -ForegroundColor Red; exit 1
}
$c = Get-Content -LiteralPath "scripts/check-ledger-landmines.js" -Raw
if ($c -match 'route\.example\.ts",') {
    Write-Host "X check-ledger-landmines.js still exempts the deleted example file" -ForegroundColor Red; exit 1
}
Write-Host "+ route.example.ts is gone and unexempted" -ForegroundColor Green

# -- 2. the invoices route creates the auto-SO through ONE transaction ----
# Anchor on what MUST exist (the 829 lesson), then on what must not.
$c = Get-Content -LiteralPath $invRoute -Raw
if ($c -notmatch "create_sales_order_atomic") {
    Write-Host "X the invoices route no longer calls create_sales_order_atomic" -ForegroundColor Red; exit 1
}
if ($c -match "from\('sales_orders'\)\s*\.delete\(" -or $c -match 'from\("sales_orders"\)\s*\.delete\(') {
    Write-Host "X the invoices route still compensates by deleting sales_orders" -ForegroundColor Red; exit 1
}
Write-Host "+ auto-SO goes through the atomic RPC; no compensating delete" -ForegroundColor Green

# -- 3. the linked-invoice delete is ONE statement (FK cascades items) ----
$c = Get-Content -LiteralPath $soPage -Raw
if ($c -notmatch 'from\("invoices"\)\.delete\(\)\.eq\("id", orderToDelete\.invoice_id\)') {
    Write-Host "X the single linked-invoice delete is missing from the sales-orders page" -ForegroundColor Red; exit 1
}
if ($c -match 'from\("invoice_items"\)\s*\.delete\(') {
    Write-Host "X the sales-orders page still deletes invoice_items separately" -ForegroundColor Red; exit 1
}
Write-Host "+ linked invoice is removed in one atomic statement" -ForegroundColor Green

# -- 4. the browser no longer touches chart_of_accounts on shareholder delete
$c = Get-Content -LiteralPath $shPage -Raw
if ($c -match 'from\("chart_of_accounts"\)[\s\S]{0,80}?\.delete\(') {
    Write-Host "X the shareholders page still deletes chart_of_accounts from the browser" -ForegroundColor Red; exit 1
}
if ($c -notmatch 'trg_cleanup_shareholder_accounts') {
    Write-Host "X the shareholders page lost the note that the DB owns the cleanup" -ForegroundColor Red; exit 1
}
Write-Host "+ shareholder-account cleanup is owned by the database alone" -ForegroundColor Green

# -- 5. the migration carries both roots, and the baseline is zero --------
$c = Get-Content -LiteralPath $mig -Raw
if ($c -notmatch "create_sales_order_atomic" -or $c -notmatch "trg_cleanup_shareholder_accounts" -or
    $c -notmatch "pg_trigger_depth") {
    Write-Host "X the 884 migration is missing one of its three pieces" -ForegroundColor Red; exit 1
}
$c = Get-Content -LiteralPath "scripts/check-impossible-rollback.js" -Raw
if ($c -notmatch 'const BASELINE = 0') {
    Write-Host "X check-impossible-rollback BASELINE must be 0 now" -ForegroundColor Red; exit 1
}
$c = Get-Content -LiteralPath "scripts/check-unchecked-writes.js" -Raw
if ($c -notmatch 'const BASELINE = 111') {
    Write-Host "X check-unchecked-writes BASELINE must be 111 (113 minus the two closed sites)" -ForegroundColor Red; exit 1
}
Write-Host "+ migration complete; impossible-rollback baseline is ZERO, unchecked-writes 111" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- $example 2>$null
git add -u -- "push_v3.74.883.ps1" 2>$null

# -- 6. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @($example, "push_v3.74.883.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the silent-cancel guard refuses - and reproducing the defect..." -ForegroundColor Cyan
node scripts/selftest-trigger-silently-cancels-delete.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the silent-cancel guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no BEFORE DELETE trigger cancels a delete in silence..." -ForegroundColor Cyan
node scripts/check-trigger-silently-cancels-delete.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a trigger can swallow a delete" -ForegroundColor Red; exit 1 }

Write-Host "Proving the impossible-rollback guard refuses (and stays silent)..." -ForegroundColor Cyan
node scripts/selftest-impossible-rollback.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the impossible-rollback guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Counting compensating deletes a trigger can refuse (want ZERO)..." -ForegroundColor Cyan
# NO `| Select-Object -First N` here (883 lesson: -First kills the pipe, node
# gets EPIPE, and a PASSING guard is declared a failure). -Last N drains.
node scripts/check-impossible-rollback.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a compensating delete a trigger can refuse still exists" -ForegroundColor Red; exit 1 }

Write-Host "Proving the sub_type divergence guard refuses..." -ForegroundColor Cyan
node scripts/selftest-subtype-tenant-divergence.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the divergence guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no sub_type exists in some companies but not others..." -ForegroundColor Cyan
node scripts/check-subtype-tenant-divergence.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a sub_type the code searches for is present in only some companies" -ForegroundColor Red; exit 1 }

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

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- $example 2>$null
git add -u -- "push_v3.74.883.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_884.txt"
    $msgLines = @(
        'fix(integrity): v3.74.884 - a rollback that can be refused is not a rollback: all four sites closed',
        '',
        'check-impossible-rollback (880) tracked four compensating/cleanup',
        'deletes on trigger-guarded tables. Each could be refused mid-chain,',
        'leaving half the work behind. BASELINE 4 -> 0.',
        '',
        '  1. POST /api/invoices auto-SO: header insert + items insert +',
        '     compensating delete -> create_sales_order_atomic (one DB',
        '     transaction, SECURITY INVOKER so the same RLS/governance/',
        '     subscription gates apply). The old delete could be refused',
        '     because the SO is born with the invoice status (may be sent),',
        '     and the document delete gate only allows draft deletes.',
        '',
        '  2. Shareholders page: since 815 the provisioned partner accounts',
        '     are is_system=TRUE, so the browser cleanup delete was refused',
        '     silently EVERY time (unchecked write) - every deleted partner',
        '     left two orphan system accounts. The DB now owns the cleanup:',
        '     trg_cleanup_shareholder_accounts (AFTER DELETE) removes both',
        '     accounts in the same transaction when they carry no entries;',
        '     the account guard distinguishes a direct app delete (still',
        '     refused for system accounts) from a system-initiated one',
        '     (pg_trigger_depth() > 1).',
        '',
        '  3. Sales-orders page linked-invoice delete: two statements',
        '     (items then header) could stop halfway -> one statement;',
        '     invoice_items FK is ON DELETE CASCADE already.',
        '',
        '  4. route.example.ts: dead (not a Next route, imported by nobody,',
        '     referenced only by its own exemption line) -> deleted, with',
        '     the exemption.',
        '',
        'Proven on BOTH databases inside cancelled transactions: partner',
        'cleanup leaves zero accounts; direct system-account delete still',
        'refused; atomic SO succeeds born-sent with items; a failing item',
        'leaves zero orphan headers; and the call works under an',
        'authenticated user identity (the 836 lesson), not just service_role.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.884 pushed - a rollback that must ask permission is a plea, not a rollback" -ForegroundColor Green
}
