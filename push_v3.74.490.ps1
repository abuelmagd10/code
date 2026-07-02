$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.489.ps1") { Remove-Item -LiteralPath "push_v3.74.489.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.490"') {
    Write-Host "+ 3.74.490" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000490_v3_74_490_retire_goods_receipt_page.sql")) {
    Write-Host "X migration 490 missing" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match "label:.*'اعتماد الاستلام'.*href.*/inventory/goods-receipt") {
    Write-Host "X sidebar still lists Goods Receipt Approvals link" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar no longer lists Goods Receipt Approvals" -ForegroundColor Green

$us = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($us -match "'inventory_goods_receipt'") {
    Write-Host "X inventory_goods_receipt still referenced in settings grid or defaults" -ForegroundColor Red; exit 1
}
Write-Host "+ inventory_goods_receipt removed from grid + defaults" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_490.txt"
    $msgLines = @(
        'feat(sidebar): v3.74.490 - retire the /inventory/goods-receipt page from navigation',
        '',
        'After v3.74.478 (bill receipt tab), v3.74.483 (items panel),',
        'v3.74.488 (mfg product receive pending), and v3.74.489 (branch',
        '+ warehouse history filter), the unified inbox covers every',
        'real flow the goods-receipt page had.',
        '',
        'Removed from active navigation:',
        '  * Sidebar Inventory groups Goods Receipt Approvals entry.',
        '  * Role-permissions grid inventory_goods_receipt row.',
        '  * Role defaults seeding of inventory_goods_receipt for',
        '    accountant, purchasing_officer, store_manager, manager.',
        '',
        'Left in place as URL fallback:',
        '  * app/inventory/goods-receipt/page.tsx still exists so',
        '    bookmarked links continue to work. A follow-up release',
        '    can delete the file once nothing external references it.',
        '',
        'Files',
        '  supabase/migrations/20260701000490_v3_74_490_retire_goods_receipt_page.sql',
        '  components/sidebar.tsx',
        '  app/settings/users/page.tsx',
        '  CONTRACTS.md (Section CK added)',
        '  lib/version.ts -> 3.74.490'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.490 pushed - goods-receipt page retired from navigation" -ForegroundColor Green
}
