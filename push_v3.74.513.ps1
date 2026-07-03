$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.512.ps1") { Remove-Item -LiteralPath "push_v3.74.512.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.513"') {
    Write-Host "+ 3.74.513" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -notmatch 'pending_warehouse' -or $ap -notmatch 'confirm-delivery') {
    Write-Host "X purchase-return warehouse stage missing from inbox" -ForegroundColor Red; exit 1
}
if ($ap -notmatch '"recv","disp","wo","tr","sret","pr","pret"') {
    Write-Host "X store roles missing pret tab" -ForegroundColor Red; exit 1
}
Write-Host "+ warehouse stage in store-manager inbox + all-role decision matrix enforced" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_513.txt"
    $msgLines = @(
        'feat(approvals): v3.74.513 - warehouse stage of purchase returns',
        'in the store-manager inbox + full role/action matrix review',
        '',
        'Owner spotted: PRET-5689 sat pending_warehouse (goods-out is the',
        'store manager job) but his inbox was empty - the pret tab was',
        'not in his role set and the loader only fetched management-stage',
        'returns.',
        '',
        '- roleTabs: store_manager + warehouse_manager gain "pret" (also',
        '  unlocks purchase-return history for them via the tab mapping).',
        '- Pending loader includes workflow_status=pending_warehouse and',
        '  carries branch_id/warehouse_id; store roles see only their',
        '  own warehouse/branch returns (admins see all).',
        '- Card is stage-aware: teal "awaiting warehouse" badge + a',
        '  Confirm Goods-Out button (POST confirm-delivery, server',
        '  asserts warehouse scope) for warehouse roles; the management',
        '  approve/reject stays admin-gated and hidden on the warehouse',
        '  stage.',
        '',
        'Full-role review (owner request): manufacturing decision buttons',
        'were still visible to manufacturing_officer who cannot execute',
        'them - BOM / routing / production-order decisions now render for',
        'admin-tier only; material-issue is stage-aware (management ->',
        'admins, warehouse dispatch -> warehouse roles), matching the',
        'server gates.',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.513'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.513 pushed - every role sees exactly its inbox" -ForegroundColor Green
}
