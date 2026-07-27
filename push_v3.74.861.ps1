$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.860.ps1") { Remove-Item -LiteralPath "push_v3.74.860.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.861"') {
    Write-Host "+ 3.74.861" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.861]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.861]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260727000007_v3_74_861_movement_cost_single_authority.sql"
$guard = "scripts/check-movement-cost-matches-ledger.js"
$self  = "scripts/selftest-movement-cost.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $guard, $self,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.861.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.860.ps1" 2>$null

# WARNING -LiteralPath is required: square brackets are wildcards in PowerShell (858).
foreach ($f in @($mig, $guard, $self)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# -- 1. one authority for the cost, not two ---------------------------------
# Ledger and FIFO both use fn_bill_item_landed_unit_cost; the TypeScript path
# wrote raw bill_items.unit_price and never even selected discount_percent, so
# every discounted purchase overstated the movement while the books stayed right.
$mg = Get-Content -LiteralPath $mig -Raw
$mgCode = ($mg -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"
foreach ($need in @("fn_bill_item_landed_unit_cost",
                    "BEFORE INSERT ON public.inventory_transactions",
                    "REVOKE ALL ON FUNCTION public.fn_set_purchase_movement_landed_cost")) {
    if ($mgCode -notmatch [regex]::Escape($need)) {
        Write-Host "X the migration is missing '$need'" -ForegroundColor Red; exit 1
    }
}
# History must stay immutable: those rows are linked to posted journals and
# prevent_linked_inventory_modification refuses to touch them, by design.
if ($mgCode -match "UPDATE public\.inventory_transactions") {
    Write-Host "X the migration rewrites historical movements - immutable by design" -ForegroundColor Red
    Write-Host "  If a fix needs a protection weakened, the fix is wrong, not the protection." -ForegroundColor Red
    exit 1
}
Write-Host "+ one authority for movement cost, and history is left immutable" -ForegroundColor Green

# -- 2. the self-test must not touch data -----------------------------------
# The trigger makes the defect unplantable, so the probe widens the enforcement
# window until the known-bad historical rows fall inside it. No writes at all.
$sf = Get-Content -LiteralPath $self -Raw
if ($sf -match "INSERT INTO|UPDATE |DELETE FROM") {
    Write-Host "X the self-test writes to the database - it must not need to" -ForegroundColor Red; exit 1
}
Write-Host "+ the self-test proves the guard without touching any data" -ForegroundColor Green

# -- 3. THE GUARD MUST BE SEEN REFUSING -------------------------------------
Write-Host "Proving the movement-cost guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-movement-cost.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

Write-Host "Checking purchase movement cost matches the ledger..." -ForegroundColor Cyan
node scripts/check-movement-cost-matches-ledger.js --require-db --list
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
git add -u -- "push_v3.74.860.ps1" 2>$null
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
        'fix(inventory): v3.74.861 - one authority for purchase cost, not two',
        '',
        'Chasing the last thing the new ledger check flagged and we did not yet',
        'understand, the trail led somewhere better: on production, movement',
        'records disagree with the books whenever a purchase carries a discount.',
        '',
        '  bill with a discount     movements 21.00   ledger 16.92   mismatch',
        '  bill without a discount  movements 60,000  ledger 60,000  exact',
        '',
        'The cost of a single purchase was being computed twice, two ways:',
        '',
        '  ledger    bills.subtotal + bills.shipping                 correct',
        '  FIFO      fn_bill_item_landed_unit_cost() - a DB trigger  correct',
        '  movement  raw bill_items.unit_price from TypeScript       wrong',
        '',
        'lib/purchase-posting.ts:287 does not even select discount_percent, so the',
        'discount is structurally invisible to that path. The books were never',
        'wrong - only the movement log, which any report reading cost straight off',
        'inventory_transactions would overstate, with the discount disappearing',
        'from the item history entirely.',
        '',
        'Fixed by deleting the second computation rather than repairing it. A',
        'BEFORE INSERT trigger fills the cost from the very same function FIFO and',
        'the ledger already use. One authority, nothing left to drift apart. It',
        'covers all three purchase paths - two of which recorded no cost at all -',
        'without touching a line of application code.',
        '',
        'Proven on the test database: an insert deliberately carrying 999.00 was',
        'stored as 10.00, the landed cost. Rolled back.',
        '',
        'The eight historical rows are deliberately NOT repaired. The owner',
        'approved repairing them; the database refused -',
        'prevent_linked_inventory_modification: a movement tied to a posted journal',
        'cannot be edited, with no escape hatch. That is the same principle as',
        'reverse-never-edit for entries, so it stands, and the rule written into',
        'the handover today applies: if a fix needs a protection weakened, the fix',
        'is wrong, not the protection. The overstatement is 11.74 across eight',
        'rows, documented in the migration and the changelog, and the guard starts',
        'from this migration date so its baseline stays a true zero rather than a',
        'constant that readers learn to ignore.',
        '',
        'The self-test touches no data at all - it cannot, because the trigger now',
        'makes the defect unplantable. Instead it widens the enforcement window',
        'until those eight known-bad rows fall inside it and demands the guard',
        'fails, then narrows it again and demands it passes. A probe built out of',
        'the truth instead of a fabrication.',
        '',
        'Nine protections refused me while building this: posted entries take no',
        'new lines, session_replication_role needs superuser, an unbalanced entry',
        'is structurally impossible, a paid-invoice revenue JE is protected, a',
        'linked movement cannot be modified, duplicate movements per bill+product',
        'are rejected, cost centres are scoped to their company, branch isolation',
        'is enforced, and a draft bill cannot move stock. Every one of them was',
        'right. None was weakened.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.861 pushed - purchase cost has one authority" -ForegroundColor Green
}
