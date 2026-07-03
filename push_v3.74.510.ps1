$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.509.ps1") { Remove-Item -LiteralPath "push_v3.74.509.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.510"') {
    Write-Host "+ 3.74.510" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -match 'receipt_approved_at' -or $ap -match 'warehouse_approved_at') {
    Write-Host "X history still selects non-existent timestamp columns" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'approved_at\.not\.is\.null,rejected_at\.not\.is\.null') {
    Write-Host "X purchase returns history missing decided-at filter" -ForegroundColor Red; exit 1
}
Write-Host "+ history loads goods-receipt, dispatch and mgmt-decided purchase returns" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_510.txt"
    $msgLines = @(
        'fix(approvals): v3.74.510 - decision history was silently empty',
        '',
        'Owner opened the history tab: All (8) - all discounts, every',
        'other category zero despite real decisions today. Three loader',
        'defects, all failing silently inside try/catch:',
        '',
        '1. goods_receipt: selected receipt_approved_at /',
        '   receipt_rejected_at - columns that do NOT exist on bills ->',
        '   PostgREST 400 on every load since the section shipped. Also',
        '   filtered receipt_status=approved while the real value is',
        '   received. Now selects real columns, filters',
        '   received/rejected, decided_at ~= updated_at.',
        '2. dispatch: selected non-existent warehouse_approved_at ->',
        '   same silent 400. Fixed likewise.',
        '3. purchase_return: filtered workflow_status IN',
        '   (approved/rejected/posted/completed), hiding returns that',
        '   the owner ALREADY approved but are pending_warehouse',
        '   (PRET-5689). The management decision is the logged event -',
        '   now filters on approved_at/rejected_at being set.',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.510'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.510 pushed - decision history complete" -ForegroundColor Green
}
