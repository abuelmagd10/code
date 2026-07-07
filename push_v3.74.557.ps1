$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.557"') { Write-Host "+ 3.74.557" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_557.txt"
    $msgLines = @(
        'fix(stock): v3.74.557 - full reservation model (PRs + invoices + transfers)',
        '',
        'Extends v3.74.556. Sales-side flows and the purchase-return trigger',
        'now block over-committing against three reservation sources:',
        '  1. pending purchase returns',
        '  2. sent-but-not-dispatched invoices',
        '  3. outbound transfers not yet arrived',
        '',
        'DB changes',
        '  * get_effective_available_stock() extended',
        '  * check_purchase_return_item_warehouse_stock() reads the same set',
        '',
        'Node changes',
        '  * app/api/sales-orders/route.ts',
        '  * app/api/invoices/route.ts',
        '  each reads pending PRs + pending-dispatch invoices + outbound',
        '  transfers across the branch warehouses and subtracts from the',
        '  view total before the insufficient-stock reject.',
        '',
        'Files',
        '  supabase/migrations/20260706000557_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.557'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.557 pushed" -ForegroundColor Green }
