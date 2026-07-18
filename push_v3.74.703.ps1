$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.702.ps1") { Remove-Item -LiteralPath "push_v3.74.702.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.703"') {
    Write-Host "+ 3.74.703" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.703]")) { Write-Host "X CHANGELOG missing [3.74.703]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# The custody-out path must carry the fix.
if ($fn -notmatch "CUSTODY_OUT_UNVALUED") {
    Write-Host "X fn_post_booking_custody_out is still the old silent version" -ForegroundColor Red; exit 1
}
Write-Host "+ custody-out reports unvalued movements instead of swallowing them" -ForegroundColor Green

if ($fn -notmatch "calculate_fifo_cost\(w\.product_id") {
    Write-Host "X custody value is not taken from the FIFO batches" -ForegroundColor Red; exit 1
}
Write-Host "+ custody value comes from the FIFO batches" -ForegroundColor Green

# The killer condition must be gone: value must NOT gate the physical movement.
if ($fn -match "v_qty <= 0 OR v_value <= 0") {
    Write-Host "X value still cancels the physical movement" -ForegroundColor Red; exit 1
}
Write-Host "+ value no longer gates the stock movement" -ForegroundColor Green

# The GL-vs-FIFO checker must count custody as owned inventory.
if ($fn -notmatch "gl_custody_1145") {
    Write-Host "X ic_inventory_gl_vs_fifo still ignores custody (1145)" -ForegroundColor Red; exit 1
}
Write-Host "+ GL-vs-FIFO checker counts custody as owned inventory" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260719000703_v3_74_703_custody_out_always_moves_stock.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.703.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.702.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_703.txt"
    $msgLines = @(
        'fix(inventory): v3.74.703 - an approved withdrawal must always move the stock',
        '',
        'Found by the owner: two items on one booking, both marked approved for',
        'withdrawal. booto left the warehouse; the oil did not, and nothing said so.',
        'Same booking, same warehouse, approvals 11 seconds apart.',
        '',
        'fn_post_booking_custody_out computed value = qty * products.cost_price and',
        'then bailed out on `v_value <= 0` BEFORE touching inventory, returning',
        'ok=true. products.cost_price is only a default that pre-fills a purchase',
        'invoice, so a product priced on the invoice instead of on its card carries',
        'zero - the same root cause as the zero-cost COGS bug in v3.74.702. An',
        'accounting attribute of zero silently cancelled a real physical movement:',
        'the technician held the oil while the books counted it in the warehouse,',
        'stock was overstated by a unit and account 1145 was short by 20.00.',
        '',
        'No integrity checker could catch this. Stock and ledger agreed - both',
        'believed the oil was in the warehouse. The checkers compare what was',
        'recorded; they cannot ask whether what should have happened did.',
        '',
        'Value and movement are now separate concerns:',
        '- value comes from the FIFO batches via calculate_fifo_cost, which computes',
        '  only and does not consume - the batches must stay intact until the service',
        '  is actually executed. Falls back to the card for legacy stock.',
        '- the inventory movement is unconditional once the item is stocked and the',
        '  quantity real. Only the journal depends on value, which is how',
        '  fn_post_booking_custody_return already worked; the OUT path was the odd',
        '  one out. The two are now symmetric.',
        '- a movement that cannot be valued raises a warning and reports',
        '  valued=false instead of disappearing behind ok=true.',
        '',
        'Owner-approved repair, idempotent: the stuck withdrawal posts at its true',
        'FIFO cost of 20.00. Verified - both items now out, 1145 = 21.00, all',
        'integrity checks clean.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.703 pushed - approved withdrawals always move the stock" -ForegroundColor Green
}
