$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.590.ps1") { Remove-Item -LiteralPath "push_v3.74.590.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.591"') {
    Write-Host "+ 3.74.591" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -notmatch "ProductSearchSelect" -or $ba -match "SelectContent") {
    Write-Host "X BookingAddons picker not upgraded" -ForegroundColor Red; exit 1
}
Write-Host "+ walk-in picker upgraded to ProductSearchSelect" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "components/bookings/BookingAddons.tsx" `
    "lib/version.ts" `
    "push_v3.74.591.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.590.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_591.txt"
    $msgLines = @(
        'feat(bookings): v3.74.591 - invoice-grade product picker for walk-in extras',
        '',
        'The walk-in extras product dropdown on the booking page was a',
        'plain Select (name + SKU only). Owner asked for the same picker',
        'used on the sales invoice: ProductSearchSelect - search by name',
        'or SKU, product image thumbnails (v3.74.497), price + stock',
        'display, products-only filter.',
        '',
        'Loader now fetches quantity_on_hand + image_urls; currency label',
        'derives from the app currency setting; unit_price fallback',
        'hardened for the optional type.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.591 pushed - smart product picker on booking extras" -ForegroundColor Green
}
