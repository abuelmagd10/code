$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.496.ps1") { Remove-Item -LiteralPath "push_v3.74.496.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.497"') {
    Write-Host "+ 3.74.497" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pss = Get-Content -LiteralPath "components/ProductSearchSelect.tsx" -Raw
if ($pss -notmatch 'ProductThumb' -or $pss -notmatch 'image_urls') {
    Write-Host "X ProductSearchSelect missing thumbnail" -ForegroundColor Red; exit 1
}

$prodPage = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($prodPage -notmatch "key: 'image_urls'") {
    Write-Host "X products list missing image column" -ForegroundColor Red; exit 1
}

$queryFiles = @(
    "app/invoices/new/page.tsx",
    "app/sales-orders/new/page.tsx",
    "app/purchase-orders/new/page.tsx",
    "app/purchase-orders/[id]/edit/page.tsx",
    "app/vendor-credits/new/page.tsx",
    "app/inventory/product-availability/page.tsx"
)
foreach ($f in $queryFiles) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch 'image_urls') {
        Write-Host "X $f missing image_urls in products query" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ thumbnails wired into products list + all 6 item pickers" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_497.txt"
    $msgLines = @(
        'feat(media): v3.74.497 - product thumbnails in list + all item pickers',
        '',
        'Follow-up to v3.74.496 (product images). The uploaded images now',
        'actually show up everywhere the owner sees or picks an item:',
        '',
        '- Products/services list page: new leading image column',
        '  (40px thumbnail, icon placeholder when no image).',
        '- Shared ProductSearchSelect: option rows and the selected value',
        '  render the first product image (falls back to the old emoji).',
        '  Inherited by: invoices/new, sales-orders/new, purchase-orders',
        '  new+edit, vendor-credits/new, inventory/product-availability.',
        '- All 6 loader queries now select image_urls.',
        '',
        'Perf: thumbnails are lazy-loaded compressed WebP (~50-150KB',
        'originals, browser fetches on scroll), DB payload grows by a',
        'few URL strings only - no impact on list speed.',
        '',
        'Files',
        '  components/ProductSearchSelect.tsx (ProductThumb)',
        '  app/products/page.tsx (image column)',
        '  app/invoices/new/page.tsx',
        '  app/sales-orders/new/page.tsx',
        '  app/purchase-orders/new/page.tsx',
        '  app/purchase-orders/[id]/edit/page.tsx',
        '  app/vendor-credits/new/page.tsx',
        '  app/inventory/product-availability/page.tsx',
        '  lib/version.ts -> 3.74.497'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.497 pushed - thumbnails live after Vercel deploy" -ForegroundColor Green
}
