$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.295.ps1") { Remove-Item -LiteralPath "push_v3.74.295.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.296"') {
    Write-Host "+ 3.74.296" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pa = Get-Content -LiteralPath "lib/product-accounting.ts" -Raw
foreach ($n in @('isRawMaterialItem','raw_material','تكلفة البضاع')) {
    if ($pa -notmatch [regex]::Escape($n)) {
        Write-Host "X product-accounting missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ product-accounting: raw_material short-circuit + multi-stage COGS lookup" -ForegroundColor Green

$pp = Get-Content -LiteralPath "app/products/page.tsx" -Raw
foreach ($n in @("formData.product_type === 'raw_material'", 'المواد الخام مش بتنباع لوحدها','حساب المصروفات التشغيلية (اختيارى)')) {
    if ($pp -notmatch [regex]::Escape($n)) {
        Write-Host "X products page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ products page: raw-material info banner + clearer service label" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_296.txt"
    $msgLines = @(
        'fix(products): v3.74.296 - accounting links match each item-type',
        '',
        'The Products & Services form showed Income + COGS pickers for every',
        'item type, including raw materials. The owner pointed out two real',
        'problems:',
        '',
        '  1. Raw materials never reach a sales journal entry. They are',
        '     purchased into Raw Materials Inventory and consumed into WIP;',
        '     income / COGS only fire when the FINISHED product is sold.',
        '     Asking for these accounts on a raw-material card is an',
        '     accounting-model mistake, not just a UX one.',
        '',
        '  2. For products and manufactured items the COGS picker was',
        '     blank even though the chart of accounts contained 5100',
        '     تكلفة البضائع المباعة (sub_type=cogs). pickCogsAccount',
        '     bailed out silently in edge cases.',
        '',
        'lib/product-accounting.ts',
        '  - Add isRawMaterialItem() helper.',
        '  - Add "raw_material" to ProductAccountingDefaults.pattern.',
        '  - getDefaultProductAccountingAccounts short-circuits for',
        '    raw materials and returns empty defaults so the UI can',
        '    hide the whole section.',
        '  - validateProductAccountingSelection() treats raw materials',
        '    as always-valid - no income / no COGS required.',
        '  - pickCogsAccount() gets a multi-stage fallback chain so a',
        '    chart with the COGS account named "تكلفة البضائع المباعة"',
        '    or "تكلفة المبيعات" but no canonical sub_type is still',
        '    matched.',
        '',
        'app/products/page.tsx',
        '  - When product_type === "raw_material", replace the income/COGS',
        '    pickers with a short blue explainer in Arabic + English:',
        '    "Raw materials are not sold directly. They are consumed in',
        '     production and flow into the finished product''s cost."',
        '  - For services, rename the second account from "حساب المصروفات"',
        '    to "حساب المصروفات التشغيلية (اختيارى)" so the inviter knows',
        '    they can leave it blank without breaking the JE.',
        '',
        'Files',
        '  lib/product-accounting.ts',
        '  app/products/page.tsx',
        '  lib/version.ts -> 3.74.296'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.296 pushed" -ForegroundColor Green
}
