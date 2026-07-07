$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.559"') { Write-Host "+ 3.74.559" -ForegroundColor Green }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_559.txt"
    $msgLines = @(
        'fix(reservations): v3.74.559 - three concurrent-workflow races closed',
        '',
        '1) Two pending payments on same bill both approved -> overpay.',
        '   get_bill_effective_outstanding and its invoice mirror now also',
        '   subtract pending_approval payment allocations. supplier + customer',
        '   payment createPayment pre-validate each allocation via the RPC.',
        '',
        '2) Bank overdraft when owner approves a batch of pending payments.',
        '   cash-balance-validator subtracts queued pending_approval outflows',
        '   on the same cash/bank account before comparing against balance.',
        '',
        '3) Customer credit apply race with pending customer refund request.',
        '   New helper get_customer_credit_effective_balance and',
        '   /api/customer-credits/[customerId]/apply uses it.',
        '',
        'Files',
        '  lib/services/supplier-payment-command.service.ts',
        '  lib/services/customer-payment-command.service.ts',
        '  lib/accounting/cash-balance-validator.ts',
        '  app/api/customer-credits/[customerId]/apply/route.ts',
        '  supabase/migrations/20260706000559_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.559'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.559 pushed" -ForegroundColor Green }
