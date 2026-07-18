$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.703 was prepared but never pushed - this release carries both.
if (Test-Path "push_v3.74.703.ps1") { Remove-Item -LiteralPath "push_v3.74.703.ps1" -Force }
if (Test-Path "push_v3.74.702.ps1") { Remove-Item -LiteralPath "push_v3.74.702.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.704"') {
    Write-Host "+ 3.74.704" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($ver in @("[3.74.703]", "[3.74.704]")) {
    if ($cl -notmatch [regex]::Escape($ver)) { Write-Host "X CHANGELOG missing $ver" -ForegroundColor Red; exit 1 }
}
Write-Host "+ CHANGELOG documents both releases" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# --- v3.74.703 : an approved withdrawal must always move the stock -------------
if ($fn -notmatch "CUSTODY_OUT_UNVALUED") {
    Write-Host "X fn_post_booking_custody_out is still the old silent version" -ForegroundColor Red; exit 1
}
if ($fn -match "v_qty <= 0 OR v_value <= 0") {
    Write-Host "X value still cancels the physical stock movement" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "gl_custody_1145") {
    Write-Host "X ic_inventory_gl_vs_fifo still ignores custody (1145)" -ForegroundColor Red; exit 1
}
Write-Host "+ custody-out always moves stock; checker counts custody as owned" -ForegroundColor Green

# --- v3.74.704 : FIFO lots carry the landed cost ------------------------------
if ($fn -notmatch "fn_bill_item_landed_unit_cost") {
    Write-Host "X the landed-cost function is missing from the DB dump" -ForegroundColor Red; exit 1
}
# The lot creator itself must call it. `NEW.reference_id` only exists inside a
# trigger function, so this call site can only be create_fifo_lot_on_purchase -
# no brittle block extraction needed (the earlier attempt tripped over $function$
# quoting in PowerShell).
if ($fn -notmatch "fn_bill_item_landed_unit_cost\(NEW\.reference_id") {
    Write-Host "X FIFO lots are still created at the gross list price" -ForegroundColor Red; exit 1
}
Write-Host "+ FIFO lots are created at landed cost" -ForegroundColor Green

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
    "supabase/migrations/20260719000704_v3_74_704_landed_cost_for_fifo_lots.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.704.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.703.ps1" "push_v3.74.702.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_704.txt"
    $msgLines = @(
        'fix(inventory): v3.74.703+704 - withdrawals always move stock; FIFO uses landed cost',
        '',
        'v3.74.703 - an approved withdrawal must always move the stock.',
        'Found by the owner: two items on one booking, both marked approved for',
        'withdrawal. One left the warehouse; the other did not, and nothing said so.',
        'fn_post_booking_custody_out computed value = qty * products.cost_price and',
        'bailed out on `v_value <= 0` BEFORE touching inventory, returning ok=true.',
        'products.cost_price is only a default that pre-fills a purchase invoice, so',
        'a product priced on the invoice carries zero - the same root cause as the',
        'zero-cost COGS bug in v3.74.702. An accounting attribute of zero silently',
        'cancelled a real physical movement. No integrity checker could catch it:',
        'stock and ledger agreed, both believing the goods were in the warehouse.',
        'Value and movement are now separate - the movement is unconditional, only',
        'the journal depends on value, mirroring the custody RETURN path which',
        'already worked this way. Unvalued movements warn instead of vanishing.',
        'ic_inventory_gl_vs_fifo now counts custody (1145) as owned inventory.',
        '',
        'v3.74.704 - FIFO batches carry the landed cost.',
        'Lots were created at bill_items.unit_price, the gross list price, while the',
        'ledger debited inventory with the amount actually payable. Every purchase',
        'discount and every freight charge drove FIFO and the GL apart, permanently',
        'and cumulatively. Since v3.74.702 made FIFO the basis for cost of sales,',
        'cost of sales was overstated and profit understated by the full purchase',
        'discount on every sale. IAS 2 / ASC 330: inventory cost is the purchase',
        'price less trade discounts, plus transport - both halves were missing.',
        '',
        'Rather than re-deriving the discount rules (line percent, header percent or',
        'fixed, before/after tax, tax-inclusive pricing, shipping) in a second place',
        'that would eventually disagree with the first, fn_bill_item_landed_unit_cost',
        'allocates the bill''s own authoritative subtotal plus shipping across the',
        'lines by net value. The lot costs then sum to the inventory debit exactly,',
        'by construction, so the two cannot drift apart again. Reproduced every',
        'existing bill to the piastre: 60000.00, 6.44, 19.90.',
        '',
        'Knock-on handled: custody already out was valued at the old gross cost.',
        'Left alone, execution would return custody at gross and consume FIFO at',
        'landed, stranding the difference in the inventory account permanently.',
        '',
        'Both repairs are idempotent. All integrity checks clean.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.704 pushed - landed cost + custody movement fix" -ForegroundColor Green
}
