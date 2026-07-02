$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.490.ps1") { Remove-Item -LiteralPath "push_v3.74.490.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.491"') {
    Write-Host "+ 3.74.491" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000491_v3_74_491_dispatch_shipping_and_mi_stage2.sql")) {
    Write-Host "X migration 491 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'shipping_provider_has_api' -or $page -notmatch 'warehouse-approve-with-shipping') {
    Write-Host "X approvals page missing approve-with-shipping button" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'management_approved' -or $page -notmatch 'isWarehouseStage') {
    Write-Host "X approvals page missing material-issue Stage 2 handling" -ForegroundColor Red; exit 1
}
Write-Host "+ approve-with-shipping + MI Stage 2 wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_491.txt"
    $msgLines = @(
        'feat(inbox): v3.74.491 - approve-with-shipping button + material issue Stage 2',
        '',
        'Sealed the last two gaps between /inventory/dispatch-approvals',
        'and the unified inbox, so we can retire that page next.',
        '',
        '1) Dispatch loader now attaches shipping_provider. When the',
        'provider is bosta or aramex and has an auth_type, the card',
        'renders a cyan "Approve + send to <provider>" button that',
        'calls /api/invoices/[id]/warehouse-approve-with-shipping.',
        'Toast surfaces the returned tracking number.',
        '',
        '2) Material issue loader now includes status=',
        'management_approved. The card is stage-aware: pending -> blue',
        '"Management Approve" hitting /management-approve; management_',
        'approved -> cyan "Approve Warehouse Dispatch" hitting /approve.',
        'Different badge colors + labels make the stage obvious.',
        '',
        'Files',
        '  supabase/migrations/20260701000491_v3_74_491_dispatch_shipping_and_mi_stage2.sql',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CL added)',
        '  lib/version.ts -> 3.74.491'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.491 pushed - dispatch page ready to retire" -ForegroundColor Green
}
