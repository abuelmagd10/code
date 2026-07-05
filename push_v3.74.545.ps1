$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.545"') { Write-Host "+ 3.74.545" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000545_v3_74_545_sync_legacy_allocation_skip_void.sql')) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_545.txt"
    $msgLines = @(
        'fix(payments): v3.74.545 - sync_legacy_payment_allocation blocked VOID rows',
        '',
        'Second trigger in the chain after v3.74.544. Once the approval',
        'trigger accepted the negative VOID row, sync_legacy_payment_allocation',
        'blindly copied NEW.amount (= -0.10) into',
        'payment_allocations.allocated_amount, tripping',
        'CHECK (allocated_amount > 0) with SQLSTATE 23514.',
        '',
        'Fix (applied via mcp__apply_migration, doc-stamped in this commit)',
        '  Both sync_legacy_payment_allocation (vendor) and',
        '  sync_legacy_customer_payment_allocation (customer) now',
        '  RETURN NEW early when voids_payment_id IS NOT NULL OR',
        '  amount <= 0. VOID reversal is already handled by the',
        '  correction RPC via bills.paid_amount -= v_orig_base; the',
        '  allocations row for a VOID would be a duplicate of that',
        '  in the wrong sign.',
        '',
        'Files',
        '  supabase/migrations/20260706000545_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.545'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.545 pushed" -ForegroundColor Green }
