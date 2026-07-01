$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.468.ps1") { Remove-Item -LiteralPath "push_v3.74.468.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.469"') {
    Write-Host "+ 3.74.469" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000469_v3_74_469_item_details_services.sql")) {
    Write-Host "X migration 469 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 469 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BP\. ?تفاصيل شاملة') {
    Write-Host "X CONTRACTS.md missing Section BP" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BP" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'item_type === "service"' -or $page -notmatch 'typeLbl') {
    Write-Host "X approvals page missing service/product badge" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page shows service/product badge" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_469.txt"
    $msgLines = @(
        'feat(diff): v3.74.469 - added/removed items show product/service badge, discount, tax',
        '',
        'Owner asked: what if the amendment adds a service, changes unit',
        'price, or changes quantity? Price + quantity changes were already',
        'in the modified-items section (v3.74.467). This release enriches',
        'the added and removed sections with full detail.',
        '',
        'Triggers',
        '   items_snapshot now includes item_type (product / service)',
        '   and description (fallback name when product_id is null).',
        '   Applied to bill + invoice + item variants (4 triggers).',
        '',
        'UI',
        '   Added / removed / modified item entries now render:',
        '     [منتج / Product] or [خدمة / Service] badge',
        '     name from product_name or description',
        '     qty x unit_price',
        '     discount % (if > 0)',
        '     tax % (if > 0)',
        '     line total',
        '',
        'Full parity across purchase invoices and sales invoices.',
        '',
        'Files',
        '   supabase/migrations/20260701000469_v3_74_469_item_details_services.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BP added)',
        '   lib/version.ts -> 3.74.469'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.469 pushed - service/product badge + full item detail" -ForegroundColor Green
}
