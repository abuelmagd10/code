$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.780.ps1") { Remove-Item -LiteralPath "push_v3.74.780.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.781"') {
    Write-Host "+ 3.74.781" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.781]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.781]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the TS side must NOT restore FIFO lots any more --------------------------
# The database does it correctly and partial-safe. The removed code restored the
# whole invoice on top of that, so its return would be a live over-count now
# that the database side actually works.
$sr = Get-Content -LiteralPath "lib/sales-returns.ts" -Raw
if ($sr -match "prepareReverseFIFOConsumption") {
    Write-Host "X lib/sales-returns.ts restores FIFO lots again - that is the double-restore" -ForegroundColor Red
    exit 1
}
if ($sr -notmatch "const fifoConsumptions: any\[\] = \[\]") {
    Write-Host "X the empty fifoConsumptions payload is gone" -ForegroundColor Red; exit 1
}
if ($sr -notmatch "const cogsTransactions: any\[\] = \[\]") {
    Write-Host "X the empty cogsTransactions payload is gone - the sub-ledger would be written twice" -ForegroundColor Red
    exit 1
}
$fe = Get-Content -LiteralPath "lib/fifo-engine.ts" -Raw
if ($fe -match "export async function prepareReverseFIFOConsumption") {
    Write-Host "X prepareReverseFIFOConsumption is back - it reverses the whole invoice" -ForegroundColor Red
    exit 1
}
Write-Host "+ lot restoration has exactly one owner (the database)" -ForegroundColor Green

# --- the two links the workflow depends on ------------------------------------
if ($sr -notmatch "invoice_item_id: item\.id") {
    Write-Host "X invoice_item_id is not sent - the over-return guard goes dead again" -ForegroundColor Red
    exit 1
}
if ($sr -notmatch "created_by_user_id: userId") {
    Write-Host "X created_by_user_id is not sent - returns cannot complete" -ForegroundColor Red; exit 1
}
Write-Host "+ the return records who made it and which invoice line it came from" -ForegroundColor Green

# --- the back door stays shut --------------------------------------------------
$sd = Get-Content -LiteralPath "app/api/sales-returns/route.ts" -Raw
if ($sd -match '\.from\("sales_returns"\)\s*\r?\n?\s*\.insert') {
    Write-Host "X /api/sales-returns inserts into sales_returns again - no items, no GL, no stock" -ForegroundColor Red
    exit 1
}
if ($sd -notmatch "status: 410") {
    Write-Host "X the retired POST no longer answers 410" -ForegroundColor Red; exit 1
}
if ($sd -notmatch "enforceGovernance") {
    Write-Host "X the retired POST answers before authenticating" -ForegroundColor Red; exit 1
}
Write-Host "+ the direct sales_returns back door is retired, auth first" -ForegroundColor Green

# --- migrations must match what was rehearsed ----------------------------------
$m1 = "supabase/migrations/20260721000006_v3_74_781_sales_return_cogs_truth.sql"
$m2 = "supabase/migrations/20260721000007_v3_74_781_sales_return_workflow_unblocked.sql"
foreach ($m in @($m1, $m2)) {
    if (-not (Test-Path -LiteralPath $m)) { Write-Host "X missing $m" -ForegroundColor Red; exit 1 }
}
$c1 = Get-Content -LiteralPath $m1 -Raw
# The rehearsal proved FIFO is only reachable if the INVOICE is resolved first.
if ($c1 -notmatch "sr\.invoice_id INTO v_invoice_id") {
    Write-Host "X the FIFO lookup still asks with the return id - it can never match" -ForegroundColor Red; exit 1
}
# inventory_transactions has created_at, not transaction_date.
#
# POSITIVE check, and the reason matters: the first version of this guard
# searched for the string "NEW.transaction_date, CURRENT_DATE" and found it in
# the migration's own comment explaining the defect. The guard rejected its own
# documentation - the same mistake made three times in v3.74.764/765. Assert
# what the code MUST contain, not what prose must not.
$dateUses = ([regex]::Matches($c1, [regex]::Escape("COALESCE(NEW.created_at::date, CURRENT_DATE)"))).Count
if ($dateUses -ne 2) {
    Write-Host "X expected 2 uses of NEW.created_at::date (journal + cogs row), found $dateUses" -ForegroundColor Red
    exit 1
}
# cogs_transactions CHECKs require quantity > 0 and total_cost >= 0, so the row
# must carry magnitudes. Again asserted positively.
if ($c1 -notmatch "'return', NEW\.reference_id,\s*\r?\n\s*v_qty,") {
    Write-Host "X the cogs row does not pass a positive quantity - the CHECK constraint rejects negatives" -ForegroundColor Red
    exit 1
}
if ($c1 -notmatch "sale_return_cogs") {
    Write-Host "X the journal type ic_cogs_balance reconciles is missing" -ForegroundColor Red; exit 1
}
$c2 = Get-Content -LiteralPath $m2 -Raw
if ($c2 -notmatch "already patched") {
    Write-Host "X the post_accounting_event patch is not replay-safe" -ForegroundColor Red; exit 1
}
if ($c2 -notmatch "RAISE EXCEPTION 'sales_returns column anchor matched") {
    Write-Host "X the patch does not verify its anchors - a zero-match would change nothing silently" -ForegroundColor Red
    exit 1
}
if ($c2 -notmatch "refusing to delete") {
    Write-Host "X the orphan cleanup does not check for ledger effects first" -ForegroundColor Red; exit 1
}
Write-Host "+ both migrations match the rehearsed versions, replay-safe, anchor-checked" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" "lib/sales-returns.ts" "lib/fifo-engine.ts" `
    "app/api/sales-returns/route.ts" `
    "supabase/migrations/20260721000006_v3_74_781_sales_return_cogs_truth.sql" `
    "supabase/migrations/20260721000007_v3_74_781_sales_return_workflow_unblocked.sql" `
    "push_v3.74.781.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.780.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_781.txt"
    $msgLines = @(
        'fix(sales-returns): v3.74.781 - a feature that had never once worked',
        '',
        'sales_returns is empty in production. Not from disuse - the feature could',
        'not complete. sales_return_approval_insert_trg refuses any status other',
        'than draft/pending_approval unless created_by_user_id belongs to an owner',
        'or general_manager, and post_accounting_event never listed that column at',
        'all while the workflow inserts status=completed. v_role was always null,',
        'the refusal always fired, the whole transaction always rolled back.',
        '',
        'Populating the column would not have been enough either: the person doing',
        'the final step is the warehouse keeper. The guard could not tell the',
        'approved workflow apart from someone hand-crafting a finished return.',
        '',
        'Proven rather than inferred - the exact insert reproduces the refusal on a',
        'restored copy of production.',
        '',
        'The workflow now announces itself with app.sales_return_workflow, set',
        'inside post_accounting_event for the life of its transaction, unreachable',
        'from the browser. Direct creation of a completed return stays blocked, and',
        'that is part of the test.',
        '',
        'Behind that locked door were five more defects, all live:',
        '',
        '  The FIFO lookup asked with the sales-return id while the consumptions',
        '  are recorded under the invoice, so it matched nothing every time and',
        '  fell through to products.cost_price - the same card-cost defect that',
        '  removed four functions in v3.74.726 and v3.74.759. The correct branch',
        '  was unreachable.',
        '',
        '  The lots were then restored twice: correctly by the database, and again',
        '  by lib/sales-returns.ts reversing the ENTIRE invoice for all products.',
        '  The TS side is removed - the database owns this, and two owners was the',
        '  problem.',
        '',
        '  The sub-ledger and the GL were computed from different numbers. The',
        '  trigger now writes the cogs_transactions row from the same figure it',
        '  posts, so they cannot disagree.',
        '',
        '  ic_cogs_balance reconciles sale_return_cogs; the trigger wrote',
        '  cogs_return. Returns were outside the reconciliation entirely.',
        '',
        '  And the trigger read NEW.transaction_date, a column that does not exist',
        '  on inventory_transactions. It would have failed the moment it was',
        '  reached. Two blockers stacked.',
        '',
        'Three links were never written: sales_return_items.invoice_item_id, which',
        'silently disabled the committed half of the over-return guard so',
        'sequential returns could exceed the quantity sold; sales_returns.',
        'journal_entry_id; and invoice_items.returned_quantity.',
        '',
        'POST /api/sales-returns inserted the request body straight into',
        'sales_returns - no items, no stock, no journal, no approval. Retired 410,',
        'auth first. And a unique index closes the read-then-insert race that',
        'allowed two open return requests for one invoice.',
        '',
        'Four of my own mistakes were caught by the rehearsal rather than shipped:',
        'clearing the trigger after reading half of it; copying the non-existent',
        'column into this very migration; choosing negative cogs_transactions',
        'values that the table CHECK constraints correctly reject; and writing a',
        'patch that was not replay-safe. A fifth reported defect turned out not to',
        'exist - the column it named is present.',
        '',
        'Verified by the first successful sales return in the project history, on a',
        'copy of production, across nine checks - including a deliberately diverged',
        'card cost, because in the real data FIFO and card cost are identical and a',
        'test on it would have proven nothing. Production totals before and after',
        'the migrations are identical. Six orphaned return items from December 2025',
        'were removed after confirming they carry no ledger or inventory effect.',
        '',
        'Still outstanding: the post-commit steps (cash refund, status, bonuses)',
        'remain outside the transaction. That is a redesign of how cash is returned',
        'to a customer, and it gets its own release.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.781 pushed - sales returns can complete for the first time" -ForegroundColor Green
}
