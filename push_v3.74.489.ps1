$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.488.ps1") { Remove-Item -LiteralPath "push_v3.74.488.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.489"') {
    Write-Host "+ 3.74.489" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000489_v3_74_489_history_scope_filter.sql")) {
    Write-Host "X migration 489 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'historyBranchFilter' -or $page -notmatch 'historyWarehouseFilter') {
    Write-Host "X approvals page missing branch/warehouse history filter" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page filters history by branch/warehouse" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_489.txt"
    $msgLines = @(
        'feat(inbox): v3.74.489 - branch + warehouse filter on the approvals history',
        '',
        'Owner + general_manager get free dropdowns to pick any branch',
        'or warehouse; the whole history narrows down accordingly.',
        'Warehouse options auto-narrow to match the picked branch.',
        '',
        'Every other role sees a read-only chip pair reflecting their',
        'assigned scope so they know why counts are smaller than a',
        'superuser would see. The filter reinforces RLS on the client.',
        '',
        'UnifiedHistoryEntry now carries optional branch_id +',
        'warehouse_id. Main loaders (discount, supplier_payment,',
        'purchase_return, dispatch, goods_receipt) attach the scope',
        'onto every entry.',
        '',
        'Files',
        '  supabase/migrations/20260701000489_v3_74_489_history_scope_filter.sql',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CJ added)',
        '  lib/version.ts -> 3.74.489'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.489 pushed - history filters by branch + warehouse" -ForegroundColor Green
}
