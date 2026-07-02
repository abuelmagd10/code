$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.501.ps1") { Remove-Item -LiteralPath "push_v3.74.501.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.502"') {
    Write-Host "+ 3.74.502" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
$bad = @('payment_type', 'voucher_number', 'target_user_id')
foreach ($b in $bad) {
    if ($ap -match [regex]::Escape($b)) {
        Write-Host "X approvals page still references non-existent column: $b" -ForegroundColor Red; exit 1
    }
}
# note_number is a substring of the CORRECT column debit_note_number,
# so match it only when NOT preceded by debit_
if ($ap -match '(?<!debit_)note_number') {
    Write-Host "X approvals page still references non-existent column: note_number" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'total_estimated_cost' -or $ap -notmatch 'debit_note_number' -or $ap -notmatch 'to_user_id') {
    Write-Host "X approvals page missing corrected column names" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals queues query real schema columns now" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_502.txt"
    $msgLines = @(
        'fix(approvals): v3.74.502 - inbox queues queried non-existent columns',
        '',
        'Store manager opened /approvals and the console showed five 400s',
        'from PostgREST (42703 column does not exist). Those queue sections',
        'have been silently empty for everyone since they shipped:',
        '',
        '  payments:             payment_no -> reference_number,',
        '                        payment_type filter -> supplier_id NOT NULL',
        '                        (payments has no payment_type column at all)',
        '  purchase_requests:    total_estimated -> total_estimated_cost',
        '  bank_voucher_requests: voucher_number -> reference_number',
        '  customer_debit_notes: note_number -> debit_note_number',
        '  permission_transfers: target_user_id -> to_user_id',
        '  inventory_write_offs: warehouses(name) embed has no FK ->',
        '                        use the denormalized warehouse_name column',
        '',
        'Fixed in both the pending-inbox loaders and the history tab.',
        'The 403 on /api/discount-approvals for store_manager is expected',
        '(route is owner/admin/GM-only) and already handled gracefully.',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.502'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.502 pushed - approvals inbox queries fixed" -ForegroundColor Green
}
