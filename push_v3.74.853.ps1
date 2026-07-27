$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.852.ps1") { Remove-Item -LiteralPath "push_v3.74.852.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.853"') {
    Write-Host "+ 3.74.853" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.853]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.853]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260727000002_v3_74_853_order_routing_costable_at_receipt.sql"
$chk = "scripts/check-finished-goods-conversion-cost.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $chk,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.853.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.852.ps1" 2>$null

$m = Get-Content -LiteralPath $mig -Raw
$c = Get-Content -LiteralPath $chk -Raw
function CodeOnly($text) {
    (($text -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*|--)' }) -join "`n"
}
$cCode = CodeOnly $c

# ── 1. the guard must sit on the RECEIPT gate ──────────────────────────────
# A production order freezes its routing version at creation, so activating a
# corrected version later does not fix an order already running. 845 checks at
# routing approval and activation - a different gate entirely. The product
# enters stock through RECEIPT, so that is where this has to be asked.
if ($m -notmatch [regex]::Escape("mpoe_assert_order_routing_is_costable")) {
    Write-Host "X the migration does not define the costability guard" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_execution_ready")) {
    Write-Host "X the guard is defined but never wired onto the receipt gate" -ForegroundColor Red; exit 1
}
$gateBlock = $m.Substring($m.IndexOf("mpoe_assert_receipt_execution_ready"))
if ($gateBlock -notmatch [regex]::Escape("PERFORM public.mpoe_assert_order_routing_is_costable")) {
    Write-Host "X the receipt gate does not call the guard" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard is wired onto the receipt gate, not only defined" -ForegroundColor Green

# ── 2. it must EXEMPT the cases that are legitimately materials-only ───────
# A company that has not priced manufacturing yet is not making a mistake.
# Refusing them would block honest work, which is worse than the bug.
if ($m -notmatch [regex]::Escape("IF COALESCE(v.rates,0) <= 0 THEN RETURN")) {
    Write-Host "X unpriced work centres are not exempted - honest setups would be blocked" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("IF NOT FOUND THEN RETURN")) {
    Write-Host "X orders with no routing are not exempted" -ForegroundColor Red; exit 1
}
Write-Host "+ unpriced work centres and routing-less orders are exempt" -ForegroundColor Green

# ── 3. REVOKE - CREATE FUNCTION grants EXECUTE to PUBLIC (844's lesson) ────
if ($m -notmatch ("REVOKE ALL ON FUNCTION public\." + [regex]::Escape("mpoe_assert_order_routing_is_costable"))) {
    Write-Host "X the new function is not revoked from PUBLIC - it is open to anon" -ForegroundColor Red; exit 1
}
Write-Host "+ the new function is revoked from PUBLIC" -ForegroundColor Green

# ── 4. the standing check must not be CIRCULAR ────────────────────────────
# The first version compared actual cost against "expected conversion from the
# routing version" - but the routing's times are zero, so expected is zero and
# nothing can ever differ. It reported all three orders healthy, including the
# one that came in at 60 instead of 118.50. Measure the CONDITION that caused
# the defect, not its result.
if ($cCode -match "fl\.unit_cost\s*<\s*e\.conversion_per_unit") {
    Write-Host "X the check is circular again - it compares cost to an expectation derived from the same zero-time routing" -ForegroundColor Red; exit 1
}
if ($cCode -notmatch [regex]::Escape("conversion_per_unit <= 0")) {
    Write-Host "X the check does not test the condition that caused the defect" -ForegroundColor Red; exit 1
}
Write-Host "+ the standing check measures the cause, not a self-referential effect" -ForegroundColor Green

# ── 5. and it must not restate history ────────────────────────────────────
# Standard costs apply forward. An order finished on the 24th cannot be charged
# with rates that were set on the 27th - that is rewriting the past, and the
# check reported exactly that false positive before this condition was added.
if ($cCode -notmatch [regex]::Escape("cost_rates_effective_from <= po.completed_at")) {
    Write-Host "X the check ignores when the rates took effect - it would demand retroactive restatement" -ForegroundColor Red; exit 1
}
Write-Host "+ rates are compared as at the order's completion, not as at today" -ForegroundColor Green

# ── 6. corrected orders clear themselves ──────────────────────────────────
# Excluding by a hand-written list of order numbers rots: the list is updated by
# memory. The correction entry IS the fix, so it is also the evidence.
if ($cCode -notmatch [regex]::Escape("manufacturing_conversion_cost_correction")) {
    Write-Host "X corrected orders are not cleared by their correction entry" -ForegroundColor Red; exit 1
}
Write-Host "+ corrected orders are cleared by their own journal entry, not a list" -ForegroundColor Green

Write-Host "Checking finished-goods conversion cost against production..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking every live movement type has a column and a filter..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.852.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_853.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.853 - finished goods entered stock at materials',
        'only, because the guard was on a different gate',
        '',
        'The owner completed a live production cycle AFTER activating the corrected',
        'routing version, and the product still entered stock at 60.00 instead of',
        '118.50 - materials only, no labour, no overhead.',
        '',
        'The activation was not the problem. A production order freezes its routing',
        'version when it is created, and that is right: an order already running',
        'must not have its cost change underneath it. But this order was bound to',
        'ROUT-002 v1, whose operation times are zero, so activating v2 afterwards',
        'never touched it.',
        '',
        'The gap is that 845 checks costability when a routing is APPROVED and',
        'ACTIVATED - a different gate entirely. Nothing asked the question at the',
        'gate the product actually comes through: receipt.',
        '',
        'Fourth time in this series, after 833, 845 and 851: a guard on one gate',
        'does not protect another. At each gate, ask what passes through it and who',
        'can stop it.',
        '',
        'And the damage does not show at production - it shows at SALE, as profit',
        'higher than it really is, with stock carried below its value.',
        '',
        'Three fixes:',
        '',
        '  Data: JE-000068 absorbs the conversion cost (Dr Inventory 58.50 / Cr',
        '  5415 applied labour 50.00 + 5410 applied overhead 8.50) AND the FIFO',
        '  lot is raised from 60 to 118.50. Both, not one: the journal alone leaves',
        '  the stock still valued wrong and it would be sold at the wrong cost.',
        '',
        '  System: mpoe_assert_order_routing_is_costable is now called from the',
        '  receipt gate, beside the materials-issued guard. It exempts what is',
        '  legitimately materials-only: an order with no routing, and work centres',
        '  with no rates at all - a company that has not priced manufacturing yet',
        '  is not making a mistake, and blocking it would be worse than the bug.',
        '',
        '  Standing check: check-finished-goods-conversion-cost.js catches what',
        '  entered before the guard existed. The guard stops the new; it cannot see',
        '  the old.',
        '',
        'Two things I nearly shipped wrong, both caught by running them against',
        'production before believing them:',
        '',
        '  The check was CIRCULAR. It compared actual cost against the conversion',
        '  cost expected from the routing version - but the routing times are zero,',
        '  so the expectation is zero and nothing can ever differ. It pronounced',
        '  all three orders healthy, including the one that came in at 60. Measure',
        '  the condition that caused the defect, not its result.',
        '',
        '  Then it falsely accused MPO-202607-000028. Its work centre rates took',
        '  effect on 27 July at 11:07; the order completed on 24 July. There were',
        '  no rates when it was made, so materials-only was the honest cost at the',
        '  time. Charging it now would be rewriting the past. The check now',
        '  compares against cost_rates_effective_from as at completion: standard',
        '  costs apply forward, not backward.',
        '',
        'Also worth recording: my own verification query reported a 22.69 gap',
        'between the inventory account and the FIFO valuation. It was my query -',
        'the posted-entry filter sat in the JOIN instead of the WHERE, so lines',
        'from DELETED entries were counted. Correctly written, the gap is 0.0000.',
        'Trial balance 0.00, inventory 257.77 both ways. A discrepancy is not',
        'reported to the owner until it is confirmed to be in his books rather',
        'than in my question.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.853 pushed - nothing enters stock below its own conversion cost" -ForegroundColor Green
}
