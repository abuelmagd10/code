$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.714.ps1") { Remove-Item -LiteralPath "push_v3.74.714.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.715"') {
    Write-Host "+ 3.74.715" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.715]")) { Write-Host "X CHANGELOG missing [3.74.715]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# The allocation base must read tax_inclusive and strip tax from the weights,
# otherwise a bill with mixed tax rates misallocates cost between products while
# the bill total still looks right - the reason no checker caught it.
if ($fn -notmatch "tax_inclusive") {
    Write-Host "X the landed-cost function ignores tax_inclusive" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "v_tax_incl THEN \(1 \+ COALESCE\(bi\.tax_rate,0\) / 100\.0\) ELSE 1 END") {
    Write-Host "X the allocation base does not strip tax from the weights" -ForegroundColor Red; exit 1
}
Write-Host "+ allocation weights are net of tax" -ForegroundColor Green

# Line-level discount must remain in both the line figure and the base - the
# thing the owner asked about, and what makes the header discount and freight
# spread by NET value rather than list price.
$discHits = ([regex]::Matches($fn, "discount_percent")).Count
if ($discHits -lt 2) {
    Write-Host "X line discount is no longer applied in both places (found $discHits)" -ForegroundColor Red; exit 1
}
Write-Host "+ line discount still applied to line and base" -ForegroundColor Green

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
    "supabase/migrations/20260719000715_v3_74_715_landed_cost_tax_inclusive_weights.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.715.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.714.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_715.txt"
    $msgLines = @(
        'fix(costing): v3.74.715 - landed-cost weights must be net of tax',
        '',
        'Came out of the owner asking whether line-level discount on a purchase',
        'order had been missed in the accounting work. It had not: the PO form',
        'stores discount_percent, buildBillItemRow carries it to the bill, and the',
        'costing engine reads it in both the line figure and the allocation base.',
        'BILL-0001 carries 10% and 5% line discounts and the engine reproduces its',
        'ledger entry to the piastre.',
        '',
        'What the question surfaced was different. The order''s totals only',
        'reconciled under tax-inclusive pricing - 21.00 / 1.14 * 0.90 = 16.58',
        'exactly - and the owner confirmed that mode is deliberate. That turns the',
        'following from hypothetical into live:',
        '',
        'bills.subtotal is always stored excluding tax, but the allocation weights',
        'were taken from unit_price, which on a tax-inclusive bill still contains',
        'the tax. With one tax rate this cancels out. With different rates per line',
        'it skews the split - a 14% line is weighted 1.14x against a 0% line and',
        'absorbs cost belonging to the other product:',
        '',
        '  two lines, true cost 100 each',
        '  before   A (14%) = 106.54   B (0%) = 93.46',
        '  after    A       = 100.00   B      = 100.00',
        '',
        'The bill total was right either way, which is exactly why no integrity',
        'check could see it. Only the per-product cost was wrong, and with it',
        'per-product profit and the FIFO lot each product carries forward.',
        '',
        'Each weight is now divided by (1 + tax_rate/100) when the bill is',
        'tax-inclusive, so the base is expressed in the same terms as the stored',
        'subtotal. Tax-exclusive bills are untouched - the divisor is 1.',
        '',
        'Verified on two bills, rolled back: inclusive gives 100.00/100.00,',
        'exclusive still gives 114.00/100.00. Every existing bill is tax-exclusive,',
        'so the restatement pass touches nothing.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.715 pushed - allocation weights net of tax" -ForegroundColor Green
}
