$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.267.ps1") { Remove-Item -LiteralPath "push_v3.74.267.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.268"') {
    Write-Host "+ 3.74.268" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bomList = Get-Content -LiteralPath "components/manufacturing/bom/bom-list-page.tsx" -Raw
foreach ($c in @(
    'fetchDefaultWarehouseForBranch',
    'محتاجين مخزن صرف الخامات',
    'إجبارى — كل أمر إنتاج بيتعمل من القائمة دى',
    'مخزن صرف الخامات'
)) {
    if ($bomList -notmatch [regex]::Escape($c)) { Write-Host "X bom-list missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bom-list: warehouse auto-fetch + required validation + auto-fallback at save" -ForegroundColor Green

$bomDetail = Get-Content -LiteralPath "components/manufacturing/bom/bom-detail-page.tsx" -Raw
foreach ($c in @(
    'محتاجين مخزن صرف الخامات',
    'إجبارى — كل أمر إنتاج بيتعمل من القائمة دى'
)) {
    if ($bomDetail -notmatch [regex]::Escape($c)) { Write-Host "X bom-detail missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bom-detail: header save now requires source_warehouse_id with explicit Arabic message" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_268.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.268 - issue warehouse is now required on BOM',
        '',
        'Why',
        '  v3.74.267 left source_warehouse_id optional and tucked it under',
        '  Advanced. The owner caught the risk: if a user creates a BOM',
        '  with no issue warehouse and then creates a production order',
        '  that also leaves it blank, the material-issue RPC accepts a',
        '  NULL warehouse_id - which is bookkeeping you do not want.',
        '',
        'What changed',
        '',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '    - New helper fetchDefaultWarehouseForBranch(branchId): hits',
        '      /api/warehouses?branch_id=... and picks the first sensible',
        '      warehouse (preferring one tagged "raw material", then a',
        '      main/default, then the first item).',
        '    - handleOpenCreate now async: after resetCreateForm() it',
        '      calls the helper to pre-fill createForm.source_warehouse_id.',
        '      So the moment the dialog opens, even before the user',
        '      expands Advanced, the field already holds a valid value.',
        '    - handleCreate now blocks save if source_warehouse_id is',
        '      still empty - it makes one more auto-fetch attempt as a',
        '      fallback, and only errors out if the branch genuinely has',
        '      no warehouses (a real configuration problem).',
        '    - Label in the Advanced section loses the (optional) tag and',
        '      gets a red asterisk; helper text now reads "إجبارى - كل',
        '      أمر إنتاج بيتعمل من القائمة دى هيسحب الخامات من المخزن ده".',
        '',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '    - handleSaveHeader() now refuses to save a BOM whose',
        '      source_warehouse_id is null, with an explicit Arabic',
        '      message.',
        '    - Header form Label matches the list-page Label: drops',
        '      "(اختياري)", adds the red asterisk, and the helper text',
        '      mirrors the new contract.',
        '',
        'What did not change',
        '  - The DB schema and the API stay the same; the column was',
        '    already nullable, we just stopped letting users save NULL',
        '    through the UI.',
        '  - Existing BOMs are not migrated. If any legacy BOM has a NULL',
        '    issue warehouse and the user opens it for editing, they will',
        '    be asked to pick one before they can save - which is the',
        '    intended behaviour.',
        '',
        'Files',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '  lib/version.ts -> 3.74.268'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.268 pushed" -ForegroundColor Green
}
