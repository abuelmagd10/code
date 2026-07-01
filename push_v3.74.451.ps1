$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.450.ps1") { Remove-Item -LiteralPath "push_v3.74.450.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.451"') {
    Write-Host "+ 3.74.451" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000451_v3_74_451_delete_gate.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 451 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AX\. ?منع حذف') {
    Write-Host "X CONTRACTS.md missing Section AX" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AX" -ForegroundColor Green

$po = Get-Content -LiteralPath "app/purchase-orders/page.tsx" -Raw
if ($po -notmatch "canDelete: permDelete && row\.status === 'draft'") {
    Write-Host "X PO list still allows delete beyond draft" -ForegroundColor Red; exit 1
}
$so = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
if ($so -notmatch "canDelete: permDelete && row\.status === 'draft'") {
    Write-Host "X SO list still allows delete beyond draft" -ForegroundColor Red; exit 1
}
Write-Host "+ PO + SO lists restrict delete to draft only" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_451.txt"
    $msgLines = @(
        'fix(critical): v3.74.451 - block delete on non-draft docs, clean orphans',
        '',
        'The purchasing officer deleted a PO that had already been',
        'through the discount-rejection flow. The DELETE succeeded and',
        'left one orphan discount_approvals row + four orphan',
        'notifications behind. Same on the sales side would break the',
        '/approvals list and audit trail.',
        '',
        'Three-layer fix:',
        '',
        '1) Cleanup: DELETE existing orphans in discount_approvals and',
        '   notifications whose reference_id points at a missing doc.',
        '',
        '2) Trigger transactional_document_delete_gate on 4 tables:',
        '   purchase_orders, sales_orders, bills, invoices',
        '     draft  -> cascade-delete linked discount_approvals and',
        '               notifications, then allow the DELETE',
        '     other  -> RAISE Arabic message pointing at void/cancel',
        '',
        '3) UI: canDelete in the /purchase-orders and /sales-orders',
        '   lists is now (permDelete && row.status === draft). The',
        '   delete button no longer appears on non-draft rows.',
        '',
        'Baseline (Section AX) verifies the trigger is present on all',
        'four tables.',
        '',
        'Files',
        '   supabase/migrations/20260630000451_v3_74_451_delete_gate.sql',
        '   app/purchase-orders/page.tsx',
        '   app/sales-orders/page.tsx',
        '   CONTRACTS.md (Section AX added)',
        '   lib/version.ts -> 3.74.451'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.451 pushed - delete gate locked down" -ForegroundColor Green
}
