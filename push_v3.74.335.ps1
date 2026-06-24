$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.334.ps1") { Remove-Item -LiteralPath "push_v3.74.334.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.335"') {
    Write-Host "+ 3.74.335" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260624000335_v3_74_335_deduct_booking_bundle_materials.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'v3.74.335 — Deduct bundle materials',
    'sum quantity_change from inventory_transactions',
    'لا يمكن تفعيل الحجز — مخزون المواد المرفقة غير كافٍ',
    'pbi.auto_deduct_inventory = TRUE',
    "transaction_type, quantity_change",
    'مادة مرفقة بخدمة'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: bundle materials deducted with stock pre-check" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_335.txt"
    $msgLines = @(
        'fix(accounting): v3.74.335 - deduct bundle materials on booking complete',
        '',
        'Long-standing accounting bug: a booking for a service like',
        '"تقشير" with two attached materials (the bundle on the catalog',
        'product) closed out cleanly, generated its invoice and revenue',
        'journal, but never touched the materials. Inventory stayed',
        'overstated and COGS stayed understated.',
        '',
        'complete_booking_atomic now does, in this order:',
        '   1. Loads bundle rows where auto_deduct_inventory is true and',
        '      the child product is item_type=product (services in a',
        '      bundle are not inventory).',
        '   2. PRE-CHECK against inventory_transactions: sums the',
        '      current stock for each material; if any required quantity',
        '      (= pbi.quantity * booking.quantity) exceeds the stock',
        '      we collect the shortages and raise a single Arabic',
        '      EXCEPTION listing every short material — owner chose',
        '      strict refusal over silent partial fulfilment.',
        '   3. After the service-side accounting runs, inserts one',
        '      inventory_transactions row per material with',
        '      transaction_type=sale and reference_id=<new invoice>.',
        '      The existing auto_create_cogs_journal trigger picks each',
        '      row up and posts DR Cost of Sales / CR Inventory.',
        '',
        'Net effect after this migration:',
        '   - Service stays a separate income journal (unchanged).',
        '   - Each attached material books its own COGS entry.',
        '   - The whole RPC is one transaction — if any insert fails,',
        '     nothing is left half-done.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000335_v3_74_335_deduct_booking_bundle_materials.sql (NEW)',
        '  lib/version.ts -> 3.74.335'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.335 pushed" -ForegroundColor Green
}
