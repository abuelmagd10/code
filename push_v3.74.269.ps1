$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.268.ps1") { Remove-Item -LiteralPath "push_v3.74.268.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.269"') {
    Write-Host "+ 3.74.269" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "app/api/manufacturing/warehouses-with-stock-summary/route.ts")) {
    Write-Host "X missing API route" -ForegroundColor Red; exit 1
}
$api = Get-Content -LiteralPath "app/api/manufacturing/warehouses-with-stock-summary/route.ts" -Raw
foreach ($c in @(
    'raw_item_count',
    'raw_total_qty',
    'products.product_type',
    'raw_material'
)) {
    if ($api -notmatch [regex]::Escape($c)) { Write-Host "X API missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ API endpoint returns raw-material stock summary per warehouse" -ForegroundColor Green

if (-not (Test-Path -LiteralPath "components/manufacturing/raw-material-warehouse-picker.tsx")) {
    Write-Host "X missing picker component" -ForegroundColor Red; exit 1
}
$picker = Get-Content -LiteralPath "components/manufacturing/raw-material-warehouse-picker.tsx" -Raw
foreach ($c in @(
    'RawMaterialWarehousePicker',
    'اختيار سليم',
    'ما فيهوش أى مواد خام',
    'CheckCircle2',
    'AlertTriangle'
)) {
    if ($picker -notmatch [regex]::Escape($c)) { Write-Host "X picker missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ picker shows raw-material counts + inline ok/warning confirmation" -ForegroundColor Green

$bomList = Get-Content -LiteralPath "components/manufacturing/bom/bom-list-page.tsx" -Raw
foreach ($c in @(
    'RawMaterialWarehousePicker',
    'محتاجين تختار مخزن صرف الخامات'
)) {
    if ($bomList -notmatch [regex]::Escape($c)) { Write-Host "X bom-list missing $c" -ForegroundColor Red; exit 1 }
}
# Make sure auto-fill is gone
if ($bomList -match 'fetchDefaultWarehouseForBranch\(createForm\.branch_id') {
    Write-Host "X bom-list still has auto-fallback in validate" -ForegroundColor Red; exit 1
}
Write-Host "+ bom-list uses picker; no auto-fallback at save" -ForegroundColor Green

$bomDetail = Get-Content -LiteralPath "components/manufacturing/bom/bom-detail-page.tsx" -Raw
if ($bomDetail -notmatch 'RawMaterialWarehousePicker') { Write-Host "X bom-detail missing picker" -ForegroundColor Red; exit 1 }
Write-Host "+ bom-detail header uses picker" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_269.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.269 - inform the user, dont auto-pick the warehouse',
        '',
        'Why',
        '  v3.74.268 auto-picked the issue warehouse using a name-based guess',
        '  ("contains keyword raw / material") and fell back to the main',
        '  warehouse if that failed. The owner flagged that the main',
        '  warehouse often holds finished goods, not raw materials, so the',
        '  fallback was bookkeeping you do not want.',
        '',
        '  We also have companies with a single warehouse that holds',
        '  everything together. Tagging warehouses by type would not help',
        '  them either.',
        '',
        '  New approach: do not guess at all. Show the user how much raw',
        '  material each warehouse currently holds, so they can pick the',
        '  right one themselves with their eyes open.',
        '',
        'What changed',
        '',
        '  app/api/manufacturing/warehouses-with-stock-summary/route.ts (new)',
        '    GET /api/manufacturing/warehouses-with-stock-summary?branch_id=...',
        '    Returns each active warehouse in the branch plus how many',
        '    distinct raw-material products it currently holds and the',
        '    total quantity, by joining inventory_available_balance with',
        '    products where product_type = raw_material. Warehouses that',
        '    actually hold raw materials are sorted first.',
        '',
        '  components/manufacturing/raw-material-warehouse-picker.tsx (new)',
        '    Drop-in replacement for WarehouseSelector when picking the',
        '    BOM issue warehouse. Each option in the dropdown shows the',
        '    raw-material stock count (e.g. "3 صنف خامات . 1,200 وحدة") so',
        '    the user can distinguish a raw-material warehouse from a',
        '    finished-goods one at a glance. After picking, an inline',
        '    strip confirms the choice:',
        '      - Green check + "اختيار سليم" if the warehouse holds raw',
        '        materials.',
        '      - Amber warning if the warehouse currently holds zero raw',
        '        materials, with text explaining the user can still pick',
        '        it but must transfer raw materials in before issuing.',
        '',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '    - handleOpenCreate is sync again. No more auto-pick on open.',
        '    - The Issue Warehouse field inside Advanced settings now',
        '      renders RawMaterialWarehousePicker instead of the generic',
        '      WarehouseSelector.',
        '    - handleCreate validation now refuses to save when',
        '      source_warehouse_id is empty; it does NOT silently fall',
        '      back to a default. The toast message points the user to',
        '      open Advanced settings and pick.',
        '',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '    - Header form also uses RawMaterialWarehousePicker for the',
        '      issue warehouse, so the same hint+confirm UX applies when',
        '      editing an existing BOM.',
        '',
        'What did not change',
        '  - No DB schema change. We do not add a warehouse_type column.',
        '  - No other module is touched. The new API only reads from',
        '    warehouses, products and inventory_available_balance, all',
        '    of which are already populated.',
        '  - Legacy BOMs render exactly the same.',
        '',
        'Files',
        '  app/api/manufacturing/warehouses-with-stock-summary/route.ts (new)',
        '  components/manufacturing/raw-material-warehouse-picker.tsx (new)',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '  lib/version.ts -> 3.74.269'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.269 pushed" -ForegroundColor Green
}
