$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.397.ps1") { Remove-Item -LiteralPath "push_v3.74.397.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.398"') {
    Write-Host "+ 3.74.398" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000398_v3_74_398_fix_po_to_bill_carryover.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'CREATE OR REPLACE FUNCTION public.approve_purchase_order_atomic',
    'shipping_tax_rate',
    'discount_position',
    'tax_inclusive',
    'exchange_rate',
    'tax_code_id',
    'v3.74.398',
    'COALESCE(v_po.shipping_tax_rate, 0)',
    'COALESCE(v_po.discount_position'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers all 5 carryover columns" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'K\. ترحيل الحقول من أمر الشراء') {
    Write-Host "X CONTRACTS.md missing Section K" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section K" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_398.txt"
    $msgLines = @(
        'fix(po-to-bill): v3.74.398 - carry every header + item field',
        '',
        'Owner traced an inconsistency in the auto-created bill BILL-0001:',
        '  PO-0001 stored shipping=1, shipping_tax_rate=14 -> tax_amount',
        '  including 0.14 shipping tax slice. BILL-0001 stored shipping=1,',
        '  shipping_tax_rate=0 BUT inherited tax_amount=1.34 from the PO.',
        '  Result: 0.14 of phantom tax in the bill total with no rate to',
        '  justify it. Recomputing the bill would shave 0.14 off the AP',
        '  liability silently.',
        '',
        'Root cause',
        '  approve_purchase_order_atomic (the RPC that creates the bill',
        '  on PO approval) had an INSERT INTO bills column list that',
        '  omitted: shipping_tax_rate, discount_position, tax_inclusive,',
        '  exchange_rate. The columns took their table defaults (0/NULL/',
        '  false) while the tax_amount was copied verbatim from the PO',
        '  with the now-stranded shipping-tax slice still inside. The',
        '  bill_items INSERT also omitted tax_code_id (added in v3.74.394),',
        '  breaking the link to /settings/taxes.',
        '',
        'Fix',
        '  1. CREATE OR REPLACE approve_purchase_order_atomic with the',
        '     missing columns. Body otherwise byte-identical (annotated',
        '     inline). COALESCE wrappers guard against legacy PO rows',
        '     with NULL on the new columns.',
        '  2. Backfill BILL-0001 + its items from PO-0001. Bill is in',
        '     draft so no posted-row trigger fires.',
        '  3. Section K added to assert_baseline / baseline_report. The',
        '     function body must reference each of: shipping_tax_rate,',
        '     discount_position, tax_inclusive, exchange_rate, tax_code_id.',
        '     Any future migration that drops one fails baseline before',
        '     it can corrupt data.',
        '',
        'Verified on live DB',
        '  PO-0001: shipping_tax_rate=14, discount_position=before_tax,',
        '           tax_inclusive=false, exchange_rate=1',
        '  BILL-0001 after backfill: identical row-for-row.',
        '  baseline_report() Section K: all 5 columns OK.',
        '  assert_baseline(): returns without raising.',
        '',
        'Files',
        '  supabase/migrations/20260629000398_v3_74_398_fix_po_to_bill_carryover.sql',
        '  CONTRACTS.md         -> Section K added',
        '  lib/version.ts       -> 3.74.398',
        '',
        'Note',
        '  Migrations applied to live DB via Supabase MCP (the function',
        '  rebuild + baseline upgrade + data backfill).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.398 pushed - PO->Bill carryover sealed + Section K guard" -ForegroundColor Green
    Write-Host "  Test: approve a new PO with shipping_tax_rate>0 and shipping>0; verify the bill's shipping_tax_rate matches and the breakdown adds up." -ForegroundColor Cyan
}
