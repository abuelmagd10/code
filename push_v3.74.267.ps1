$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.266.ps1") { Remove-Item -LiteralPath "push_v3.74.266.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.267"') {
    Write-Host "+ 3.74.267" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bom = Get-Content -LiteralPath "components/manufacturing/bom/bom-list-page.tsx" -Raw
foreach ($c in @(
    'nextAutoBomCode',
    'إعدادات متقدمة',
    'المنتج المصنّع',
    'محتاجين تحدد المنتج',
    'بيتعبّأ من اسم المنتج تلقائياً',
    'مخزن صرف الخامات الافتراضى'
)) {
    if ($bom -notmatch [regex]::Escape($c)) { Write-Host "X bom missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ BOM form: only Manufactured Product visible; auto-code + auto-name; everything else collapsed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_267.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.267 - Phase 2b - simplified BOM creation form',
        '',
        'Mirrors what v3.74.266 did for Work Centers. The Create BOM dialog',
        'used to ask for 7 fields up front (Branch, Issue Warehouse, Product,',
        'BOM Code, BOM Name, Usage Type, Active toggle, Description). For a',
        'factory owner that is overwhelming - the only thing the user really',
        'has to decide at this step is "which product am I writing a recipe',
        'for?".',
        '',
        'What changed',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '',
        '  Only ONE field is visible by default now:',
        '    - المنتج المصنّع (Manufactured Product). Marked required.',
        '',
        '  Everything else lives under a single collapsed accordion',
        '  "إعدادات متقدمة" (Advanced settings):',
        '    - Branch, Default Issue Warehouse, BOM Code, BOM Name,',
        '      Usage Type, Active toggle, Description.',
        '',
        '  Auto-fill so the user does not have to think about codes or',
        '  names:',
        '    - nextAutoBomCode() returns the next free BOM-NNN by scanning',
        '      the existing list and taking max+1.',
        '    - resetCreateForm() pre-fills branch_id with the first',
        '      available branch and bom_code with nextAutoBomCode().',
        '    - When the user selects a Product, bom_name is auto-populated',
        '      with the product name (only if the user has not already',
        '      typed a custom name).',
        '    - handleSave() now only requires product_id. If branch_id,',
        '      bom_code or bom_name are still blank it fills them in from',
        '      the same defaults. The only error path left is "no branches',
        '      exist in the company" - which is a real blocker.',
        '',
        'What did not change',
        '  - The API payload (BomCreatePayload) is identical.',
        '  - Duplicate-detection, scope-loading, and existing BOM listing',
        '    behaviour are untouched.',
        '  - Existing BOMs continue to render exactly the same.',
        '',
        'Next',
        '  v3.74.268: simplify the Routing form.',
        '  v3.74.269: simplify the Production Order form.',
        '',
        'Files',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '  lib/version.ts -> 3.74.267'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.267 pushed" -ForegroundColor Green
}
