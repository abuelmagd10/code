$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.296.ps1") { Remove-Item -LiteralPath "push_v3.74.296.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.297"') {
    Write-Host "+ 3.74.297" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# v3.74.296 — product accounting
$pa = Get-Content -LiteralPath "lib/product-accounting.ts" -Raw
foreach ($n in @('isRawMaterialItem','raw_material','تكلفة البضاع')) {
    if ($pa -notmatch [regex]::Escape($n)) {
        Write-Host "X product-accounting missing: $n" -ForegroundColor Red; exit 1
    }
}
$pp = Get-Content -LiteralPath "app/products/page.tsx" -Raw
foreach ($n in @("formData.product_type === 'raw_material'", 'المواد الخام مش بتنباع لوحدها','حساب المصروفات التشغيلية (اختيارى)')) {
    if ($pp -notmatch [regex]::Escape($n)) {
        Write-Host "X products page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ accounting links UX (raw-material / service / product)" -ForegroundColor Green

# v3.74.297 — purchasing officer products+services
$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
if ($ac -notmatch "purchasing_officer: \[[^\]]*'products'") {
    Write-Host "X access-context: purchasing_officer does not include 'products'" -ForegroundColor Red; exit 1
}
Write-Host "+ access-context: purchasing_officer now gets products + services" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_297.txt"
    $msgLines = @(
        'feat: v3.74.297 - accounting links UX + purchasing-officer access to products',
        '',
        'Two related improvements requested by the owner while testing the',
        'manufacturing flow.',
        '',
        '== v3.74.296: accounting links match each item-type ==',
        '',
        'The Products & Services form showed Income + COGS pickers for every',
        'item type, including raw materials. Two real problems:',
        '',
        '  1. Raw materials never reach a sales journal entry. They are',
        '     purchased into Raw Materials Inventory and consumed into WIP;',
        '     income / COGS only fire when the FINISHED product is sold.',
        '',
        '  2. For products and manufactured items the COGS picker was blank',
        '     even though the chart of accounts contained 5100 تكلفة البضائع',
        '     المباعة (sub_type=cogs). pickCogsAccount bailed out silently',
        '     in edge cases.',
        '',
        'lib/product-accounting.ts',
        '  - Add isRawMaterialItem() helper, "raw_material" pattern.',
        '  - getDefaultProductAccountingAccounts short-circuits for raw',
        '    materials, returns empty defaults.',
        '  - validateProductAccountingSelection() treats raw materials as',
        '    always-valid.',
        '  - pickCogsAccount() gets a multi-stage fallback chain.',
        '',
        'app/products/page.tsx',
        '  - product_type === "raw_material" replaces the income/COGS',
        '    pickers with a short blue explainer.',
        '  - Service expense label renamed to "حساب المصروفات التشغيلية',
        '    (اختيارى)".',
        '',
        '== v3.74.297: purchasing officer can open Products & Services ==',
        '',
        'The buyer needs the page to look up SKUs when building a PO and to',
        'register a new raw material when the supplier offers one we do not',
        'carry yet. Added two new permission rows.',
        '',
        'lib/access-context.tsx',
        '  - purchasing_officer default pages now include products + services.',
        '',
        'DB migration add_products_services_to_purchasing_officer (applied):',
        '  - seed_default_role_permissions() function updated so new',
        '    companies get the two rows on creation.',
        '  - Backfilled rows for all 4 existing companies (idempotent).',
        '  - Permissions granted: read + write + update. Delete withheld',
        '    to keep accidental SKU deletions out of the buyer''s scope.',
        '',
        'Files',
        '  lib/product-accounting.ts',
        '  lib/access-context.tsx',
        '  app/products/page.tsx',
        '  lib/version.ts -> 3.74.297',
        '  + DB function seed_default_role_permissions'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.297 pushed" -ForegroundColor Green
}
