$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.858.ps1") { Remove-Item -LiteralPath "push_v3.74.858.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.859"') {
    Write-Host "+ 3.74.859" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.859]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.859]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260727000005_v3_74_859_audit_trigger_shape_independent.sql"
$guard = "scripts/check-audit-trail-actually-records.js"
$self  = "scripts/selftest-audit-trail-records.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $guard, $self,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.859.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.858.ps1" 2>$null

# ⚠️ -LiteralPath: الأقواس المربعة أحرف نمط فى PowerShell (درس 858).
foreach ($f in @($mig, $guard, $self)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# ── 1. the hand-written table list must be gone, not extended ──────────────
# v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills',...) THEN
# NEW.branch_id END - PL/pgSQL plans the whole expression against the real row
# type no matter what the condition says, so on a table without branch_id it
# raises, WHEN OTHERS swallows it, and nothing is ever written.
$mg = Get-Content -LiteralPath $mig -Raw
$mgCode = ($mg -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"
if ($mgCode -match "TG_TABLE_NAME\s+IN\s*\(") {
    Write-Host "X the migration still keys off a hand-written table list" -ForegroundColor Red; exit 1
}
foreach ($need in @("to_jsonb(OLD)", "to_jsonb(NEW)", "->> 'branch_id'", "->> 'cost_center_id'")) {
    if ($mgCode -notmatch [regex]::Escape($need)) {
        Write-Host "X the migration does not read the row shape-independently ('$need')" -ForegroundColor Red
        exit 1
    }
}
# and the 840 lesson must survive: 57014 is NOT caught by WHEN OTHERS
if ($mgCode -notmatch "WHEN query_canceled THEN") {
    Write-Host "X query_canceled (57014) is no longer handled - an audit failure could abort a sale" -ForegroundColor Red
    exit 1
}
Write-Host "+ the audit trigger reads the row shape-independently, 57014 still handled" -ForegroundColor Green

# ── 2. THE GUARD MUST BE SEEN REFUSING ─────────────────────────────────────
# Reporting zero proves nothing. The self-test puts the known-broken function
# back on the TEST database and demands the guard fails, then restores it.
# 833, 845, 851, 853, 857, 858 all shipped past guards that were asleep.
Write-Host "Proving the audit-trail guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-audit-trail-records.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

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
git add -u -- "push_v3.74.858.ps1" 2>$null
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
        'fix(audit): v3.74.859 - six tables had no audit trail at all',
        '',
        'Found from a passing warning in the database log while chasing something',
        'else: Audit log failed: record "new" has no field "branch_id".',
        '',
        'audit_trigger_function reads the branch and cost centre through a',
        'hand-written list of table names:',
        '',
        '  v_branch_id := CASE WHEN TG_TABLE_NAME IN (...) THEN NEW.branch_id END;',
        '',
        'Six audited tables have no branch_id column at all. The CASE condition',
        'does not save you: PL/pgSQL plans the whole expression against the real',
        'row type before it runs, so the error is raised regardless, WHEN OTHERS',
        'swallows it, and no audit row is ever written.',
        '',
        'Measured on production before the fix - invoices had 431 audit rows:',
        '',
        '  company_role_permissions  0     who changed a permission?',
        '  accounting_periods        0     who reopened a closed period?',
        '  tax_codes                 0     who changed a tax rate?',
        '  shareholders              0',
        '  asset_transactions        0',
        '  payroll_runs              0 from the trigger (2 written by app code)',
        '',
        'So the hole sat exactly where recording matters most, while invoices,',
        'journal entries and payments were fully covered. Nobody would ever report',
        'it: no error is shown, the operation succeeds, and it surfaces only as a',
        'warning in a log nobody reads.',
        '',
        'Fixed by deleting the table list rather than extending it. The row is read',
        'as jsonb - (to_jsonb(NEW) ->> \u0027branch_id\u0027)::uuid returns NULL for a missing',
        'key and never raises - so the same function works on every table, today and',
        'on every table added later.',
        '',
        'Verified on the test database and then on production, everything rolled',
        'back: the six silent tables now record; the twelve already-working tables',
        'still record with branch and cost centre intact; inventory_transactions',
        'was refused by an existing business guard, which proves the protections',
        'were not touched. All 24 audited tables were checked for foreign keys',
        'first - every branch_id really does reference branches - so the change',
        'cannot introduce a value the FK would reject. The 840 exception handling',
        'is untouched: query_canceled (57014) is still caught explicitly, so a',
        'logging failure can never abort a business operation.',
        '',
        'What is NOT claimed: the audit entries already lost cannot be recovered.',
        'There is no source to rebuild them from. The gap is documented, not',
        'papered over. Everything from today forward is recorded.',
        '',
        'And a new standing guard - empirical, not syntactic, which is the lesson.',
        'My first attempt read the function source and flagged every NEW.<col> for',
        'a column the table lacks. It produced 21 false positives. A direct',
        'experiment on production showed why:',
        '',
        '  IF TG_TABLE_NAME = \u0027other\u0027 THEN v := NEW.absent; END IF;  never fails',
        '  v := CASE WHEN TG_TABLE_NAME = \u0027other\u0027 THEN NEW.absent END; always fails',
        '',
        'PL/pgSQL plans statements when it reaches them; a single expression is',
        'planned whole. Shape is not enough, so measure the effect: check:audit-records',
        'updates one row to itself inside a transaction that is rolled back and',
        'demands an audit row appear. Zero false positives, and it measures the',
        'thing that actually matters. A guard shipped with 21 false alarms would',
        'have trained us to ignore it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.859 pushed - every audited table records again" -ForegroundColor Green
}
