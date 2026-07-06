$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.556"') { Write-Host "+ 3.74.556" -ForegroundColor Green }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_556.txt"
    $msgLines = @(
        'fix(stock): v3.74.556 - sales flows now respect pending purchase-return reservations',
        '',
        'Race: warehouse has 4, PR for 1 approved (pending_warehouse), employee',
        'sells 4 -> sale succeeded because inventory_available_balance sums',
        'transactions only. Return could then not be executed.',
        '',
        'Fix',
        '  * DB helper get_effective_available_stock() canonicalises the',
        '    reservation math (applied via mcp__apply_migration).',
        '  * app/api/sales-orders/route.ts + app/api/invoices/route.ts:',
        '    after reading the view, subtract pending purchase_return_items',
        '    for the same (company, branch, product) whose parent is in',
        '    pending_admin_approval / pending_approval / pending_warehouse /',
        '    partial_approval - same set the v3.74.174 PR trigger uses.',
        '',
        'Files',
        '  app/api/sales-orders/route.ts',
        '  app/api/invoices/route.ts',
        '  supabase/migrations/20260706000556_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.556'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.556 pushed" -ForegroundColor Green }
