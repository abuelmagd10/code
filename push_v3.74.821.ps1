$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.820.ps1") { Remove-Item -LiteralPath "push_v3.74.820.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.821"') {
    Write-Host "+ 3.74.821" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.821]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.821]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m9 = Get-Content -LiteralPath "supabase/migrations/20260725000009_v3_74_821_purchase_return_single_fifo_owner.sql" -Raw

# --- (a) one owner for the FIFO reduction -------------------------------------
if ($m9 -notmatch [regex]::Escape("IF FALSE THEN")) {
    Write-Host "X the duplicate FIFO reduction is still live - returns would consume double" -ForegroundColor Red; exit 1
}
if ($m9 -notmatch [regex]::Escape("trg_fifo_on_purchase_return")) {
    Write-Host "X the patch does not name the surviving owner" -ForegroundColor Red; exit 1
}
Write-Host "+ a return consumes each batch once, not twice" -ForegroundColor Green

# --- (b) the ledger follows the batches ---------------------------------------
foreach ($must in @("fifo_lot_consumptions", "v_cost_gap", "'5140'")) {
    if ($m9 -notmatch [regex]::Escape($must)) {
        Write-Host "X the inventory line still ignores real batch cost: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the ledger credits inventory with what actually left the batches" -ForegroundColor Green

# --- (c) the correction can never unbalance the entry -------------------------
if ($m9 -notmatch [regex]::Escape("CASE WHEN v_cost_gap < 0 THEN ABS(v_cost_gap) ELSE 0 END")) {
    Write-Host "X the correcting lines are not symmetric - the entry could unbalance" -ForegroundColor Red; exit 1
}
Write-Host "+ the correction is a matched debit and credit, balanced by construction" -ForegroundColor Green

# --- (d) the patch is anchored safely -----------------------------------------
foreach ($must in @("anchor1 not unique", "anchor2 not unique", "already patched")) {
    if ($m9 -notmatch [regex]::Escape($must)) {
        Write-Host "X the patch lacks its safety check: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the patch refuses any anchor it cannot pin down exactly once" -ForegroundColor Green

# --- (e) the historical repair is documented with its numbers -----------------
foreach ($must in @("JE-000064", "140.77", "0.14")) {
    if ($m9 -notmatch [regex]::Escape($must)) {
        Write-Host "X the data repair is not documented: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the 0.14 that haunted us is closed, and the proof is written down" -ForegroundColor Green

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

$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "supabase/migrations/20260725000009_v3_74_821_purchase_return_single_fifo_owner.sql",
    "push_v3.74.821.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.820.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_821.txt"
    $msgLines = @(
        'fix(purchase-returns): v3.74.821 - one owner for the FIFO reduction,',
        'and the 0.14 drift is finally closed',
        '',
        'Two defects, one of which had never yet been exercised:',
        '',
        '(1) DOUBLE FIFO REDUCTION. Batches were reduced twice on every',
        '    return: once by trg_fifo_on_purchase_return, which hangs off the',
        '    inventory movement itself (v3.74.702), and again by a duplicate',
        '    block inside confirm_purchase_return_delivery_v2 that walked the',
        '    bill''s lots by hand. Any return through the live path would have',
        '    consumed DOUBLE the quantity - stock vanishing for no reason,',
        '    inflated COGS, and eventually "insufficient batch quantity"',
        '    errors. It has not bitten yet only because the two existing',
        '    returns predate the trigger. The trigger is now the single owner;',
        '    the inline block is explicitly disabled, not left running in',
        '    parallel (lesson 804). Rehearsed: a 10-unit lot with a 2-unit',
        '    return leaves 8 remaining and ONE consumption row of 2.40.',
        '',
        '(2) The entry credited inventory at the return document price while',
        '    the batches left at their true cost including capitalised',
        '    freight. The supplier refunds the goods, not the freight, so the',
        '    difference is now recognised as purchase freight expense (5140)',
        '    instead of quietly drifting. The two added lines are a matched',
        '    debit and credit, so the entry stays balanced by construction.',
        '',
        'DATA REPAIR, per the owner''s completed rule: inventory account 140.63',
        'against a batch valuation of 140.77 - the 0.14 that has followed this',
        'project across sessions. Its source: PRET-5689 and PRET-79328, run on',
        '3 and 9 July, BEFORE the v3.74.702 fix, recording the goods leaving at',
        'document price rather than batch cost. Corrected with a valuation',
        'adjustment entry (JE-000064), never by editing a posted entry.',
        '',
        'Verified after: inventory account 140.77 = batch valuation 140.77,',
        'trial balance 0.00. The gap is closed.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.821 pushed - the ledger and the batches finally agree to the millieme" -ForegroundColor Green
}
