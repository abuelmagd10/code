$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.410.ps1") { Remove-Item -LiteralPath "push_v3.74.410.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.411"') {
    Write-Host "+ 3.74.411" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
foreach ($n in @(
    'v3.74.411',
    'المجموع الفرعى',
    'الخصم',
    'ضريبة الشحن',
    'shipping_tax_rate',
    'discount_position'
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ PO view card carries the financial breakdown" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_411.txt"
    $msgLines = @(
        'feat(po): v3.74.411 - financial breakdown on order info card',
        '',
        'Owner asked for the discount, tax, shipping cost and shipping',
        'tax rate to surface on the PO view card so they can audit the',
        'order without opening the bill or scrolling to the items',
        'table.',
        '',
        'Card now shows, when present:',
        '  Subtotal              (المجموع الفرعى, pre-discount)',
        '  Discount + position   (red row, الخصم قبل/بعد الضريبة)',
        '  Tax                   (إجمالى الضريبة)',
        '  Shipping              (تكلفة الشحن)',
        '  Shipping Tax %        (نسبة ضريبة الشحن)',
        '  Adjustment            (التعديل)',
        '  Order Total           (existing)',
        '',
        'Rows are conditional - if the field is zero they stay hidden,',
        'so simple POs without discount or shipping do not get a wall',
        'of zeros.',
        '',
        'Files',
        '  app/purchase-orders/[id]/page.tsx',
        '  lib/version.ts -> 3.74.411'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.411 pushed - PO view card shows full financial breakdown" -ForegroundColor Green
}
