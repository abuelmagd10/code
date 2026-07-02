$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.495.ps1") { Remove-Item -LiteralPath "push_v3.74.495.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.496"') {
    Write-Host "+ 3.74.496" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260702000496_v3_74_496_product_images_expense_attachments.sql")) {
    Write-Host "X migration 496 missing" -ForegroundColor Red; exit 1
}

if (-not (Test-Path "components/attachments-uploader.tsx")) {
    Write-Host "X attachments-uploader component missing" -ForegroundColor Red; exit 1
}

$prod = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($prod -notmatch 'AttachmentUploader' -or $prod -notmatch 'image_urls') {
    Write-Host "X products page missing image uploader" -ForegroundColor Red; exit 1
}

$exp = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
if ($exp -notmatch 'expense-attachments') {
    Write-Host "X new expense page missing attachments" -ForegroundColor Red; exit 1
}

$expDetail = Get-Content -LiteralPath "app/expenses/[id]/page.tsx" -Raw
if ($expDetail -notmatch 'createSignedUrl') {
    Write-Host "X expense detail page missing attachment viewer" -ForegroundColor Red; exit 1
}
Write-Host "+ product images (max 3) + expense voucher attachments wired in" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_496.txt"
    $msgLines = @(
        'feat(media): v3.74.496 - product images (max 3) + expense voucher attachments',
        '',
        'Products/services form now accepts up to 3 images per item.',
        'Images are compressed client-side (canvas -> WebP, max 1200px)',
        'before upload, so storage stays tiny and lists stay fast.',
        'Stored in public bucket product-images; DB keeps only URLs',
        '(products.image_urls text[], CHECK <= 3).',
        '',
        'New expense page accepts up to 5 payment-voucher attachments',
        '(images or PDF, 10MB cap). Stored in PRIVATE bucket',
        'expense-attachments (financial documents); expense detail page',
        'renders them via 1h signed URLs. Metadata in expenses.attachments jsonb.',
        '',
        'Storage RLS follows the backups-bucket pattern: first path',
        'segment = company_id checked against company_members.',
        'Migration already applied to production via Supabase MCP.',
        '',
        'Files',
        '  supabase/migrations/20260702000496_v3_74_496_product_images_expense_attachments.sql',
        '  components/attachments-uploader.tsx (new, dependency-free)',
        '  app/products/page.tsx',
        '  app/api/products/route.ts',
        '  app/expenses/new/page.tsx',
        '  app/expenses/[id]/page.tsx',
        '  lib/version.ts -> 3.74.496'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.496 pushed - product images + expense attachments live after Vercel deploy" -ForegroundColor Green
}
