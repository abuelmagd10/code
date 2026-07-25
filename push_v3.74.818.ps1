$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.817.ps1") { Remove-Item -LiteralPath "push_v3.74.817.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.818"') {
    Write-Host "+ 3.74.818" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.818]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.818]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m6 = Get-Content -LiteralPath "supabase/migrations/20260725000006_v3_74_818_finished_goods_lot_carries_conversion_cost.sql" -Raw

# --- (a) the SQL twin of the TS conversion formula -----------------------------
foreach ($must in @("mpoe_conversion_cost", "labor_cost_rate", "efficiency_percent",
                    "variable_overhead_rate", "fixed_overhead_rate", "status = 'completed'")) {
    if ($m6 -notmatch [regex]::Escape($must)) {
        Write-Host "X conversion formula incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the database computes conversion the same way the journal does" -ForegroundColor Green

# --- (b) the lot is priced with materials PLUS conversion ----------------------
if ($m6 -notmatch [regex]::Escape("v_total_issued_cost + COALESCE(v_conversion_cost, 0)")) {
    Write-Host "X the finished-goods lot is still priced on materials alone" -ForegroundColor Red; exit 1
}
Write-Host "+ the batch carries what the ledger charges" -ForegroundColor Green

# --- (c) the patch is anchored safely -----------------------------------------
foreach ($must in @("anchor not unique", "declare anchor not unique", "already patched")) {
    if ($m6 -notmatch [regex]::Escape($must)) {
        Write-Host "X the patch lacks its safety check: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the patch refuses to run on an anchor it cannot pin down exactly once" -ForegroundColor Green

# --- (d) partial receipts split conversion too ---------------------------------
if ($m6 -notmatch [regex]::Escape("/ v_order.planned_quantity) * v_received_qty")) {
    Write-Host "X a partial receipt would drop the conversion share" -ForegroundColor Red; exit 1
}
Write-Host "+ a partial receipt carries its share of conversion, not just materials" -ForegroundColor Green

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
    "supabase/migrations/20260725000006_v3_74_818_finished_goods_lot_carries_conversion_cost.sql",
    "push_v3.74.818.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.817.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_818.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.818 - the finished-goods batch now carries',
        'conversion cost, not materials alone',
        '',
        'The ledger and the inventory valuation were charging two different',
        'numbers for the same receipt:',
        '',
        '  - postProductReceiptJournal debits Finished Goods with materials',
        '    PLUS conversion (labour + manufacturing overhead), which is the',
        '    IAS 2 treatment, and raises the wages liability and the overhead',
        '    applied account.',
        '  - receipt_manufacturing_production_order_output_atomic priced the',
        '    inventory transaction AND the FIFO lot from v_total_issued_cost',
        '    alone - materials only.',
        '',
        'Once work-centre rates are non-zero that produces: a permanent drift',
        'between the inventory account and lot valuation equal to conversion,',
        'compounding with every production order; an understated COGS when the',
        'finished product is sold, which OVERSTATES profit - the most dangerous',
        'consequence; and product-cost reports showing a cheaper product than',
        'reality, feeding wrong pricing decisions.',
        '',
        'It stayed invisible in the first live production run only because the',
        'work centres carried zero rates: the product entered at 60 (materials)',
        'and its COGS left at 60. They matched by coincidence, not by design.',
        '',
        'mpoe_conversion_cost is an exact SQL twin of calculateConversionCost:',
        'labour minutes / 60 x rate x efficiency multiplier, plus machine',
        'minutes / 60 x (machine + variable + fixed overhead rates), over',
        'completed operations only. Its value is added to the receipt cost',
        'BEFORE the inventory transaction and the FIFO lot are created, so both',
        'sources agree by construction. Partial receipts prorate materials and',
        'conversion together.',
        '',
        'Applied to both databases with the documented-anchor technique: the',
        'anchor must match exactly once, an idempotency marker prevents double',
        'patching, and the DECLARE anchor uses the full declaration line rather',
        'than the bare variable name - the non-unique-anchor lesson.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.818 pushed - cost travels whole: materials and conversion together" -ForegroundColor Green
}
