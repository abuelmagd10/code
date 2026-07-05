$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.552"') { Write-Host "+ 3.74.552" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000552_v3_74_552_po_and_so_page_void_and_returns.sql')) {
    Write-Host "X doc-stamp migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ doc-stamp migration present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_552.txt"
    $msgLines = @(
        'fix(orders): v3.74.552 - PO/SO detail hides voided pays + subtracts returns',
        '',
        'PO detail was showing 4.34 EGP remaining after the correction executed,',
        'because netRemaining did not subtract returned_amount. The payments',
        'tab also displayed the voided original + VOID row alongside the',
        'corrected payment. Mirrored on sales-orders/[id].',
        '',
        'Fixes',
        '  * payments query: .is(voided_at,null).is(voids_payment_id,null)',
        '  * select base_currency_amount + amount',
        '  * totalPaid sums base_currency_amount (FC -> EGP)',
        '  * Amount column renders base_currency_amount',
        '  * netRemaining = total - paid - returned',
        '',
        'Files',
        '  app/purchase-orders/[id]/page.tsx',
        '  app/sales-orders/[id]/page.tsx',
        '  supabase/migrations/20260706000552_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.552'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.552 pushed" -ForegroundColor Green }
