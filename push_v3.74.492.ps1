$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.491.ps1") { Remove-Item -LiteralPath "push_v3.74.491.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.492"') {
    Write-Host "+ 3.74.492" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000492_v3_74_492_retire_dispatch_and_srr.sql")) {
    Write-Host "X migration 492 missing" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match "label:.*'موافقات الإرسال'.*href.*/inventory/dispatch-approvals") {
    Write-Host "X sidebar still lists Dispatch Approvals" -ForegroundColor Red; exit 1
}
if ($sb -match "label:.*'موافقات مرتجعات المبيعات'.*href.*/sales-return-requests") {
    Write-Host "X sidebar still lists Sales Return Approvals" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar no longer lists Dispatch / Sales Return" -ForegroundColor Green

$us = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($us -match "value: 'dispatch_approvals'") {
    Write-Host "X dispatch_approvals still in grid" -ForegroundColor Red; exit 1
}
if ($us -match "value: 'sales_return_requests'") {
    Write-Host "X sales_return_requests still in grid" -ForegroundColor Red; exit 1
}
if ($us -match "'dispatch_approvals',") {
    Write-Host "X dispatch_approvals still in defaults" -ForegroundColor Red; exit 1
}
Write-Host "+ settings/users grid + defaults clean" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_492.txt"
    $msgLines = @(
        'feat(sidebar): v3.74.492 - retire dispatch-approvals + sales-return-requests from navigation',
        '',
        'After v3.74.491 sealed the last gaps (approve-with-shipping +',
        'material issue Stage 2), the unified inbox covers everything',
        'both pages did.',
        '',
        'Removed from active navigation:',
        '  * Sidebar inventory groups Dispatch Approvals entry.',
        '  * Sidebar inventory groups Sales Return Approvals entry.',
        '  * settings/users grid: dispatch_approvals row.',
        '  * settings/users grid: sales_return_requests row.',
        '  * Role defaults: dispatch_approvals seed for accountant,',
        '    purchasing_officer, store_manager, manager.',
        '',
        'Left in place as URL fallback:',
        '  app/inventory/dispatch-approvals/page.tsx',
        '  app/sales-return-requests/page.tsx',
        '',
        'A follow-up release can delete these files once we confirm',
        'nothing external references them.',
        '',
        'Files',
        '  supabase/migrations/20260701000492_v3_74_492_retire_dispatch_and_srr.sql',
        '  components/sidebar.tsx',
        '  app/settings/users/page.tsx',
        '  CONTRACTS.md (Section CM added)',
        '  lib/version.ts -> 3.74.492'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.492 pushed - inventory group cleaned up" -ForegroundColor Green
}
