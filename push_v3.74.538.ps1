$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.538"') {
    Write-Host "+ 3.74.538" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath 'app/api/payments/[id]/vendor-request-correction/route.ts' -Raw
if ($route -notmatch 'proposed\.original_currency') {
    Write-Host "X vendor correction route not whitelisting original_currency" -ForegroundColor Red; exit 1
}
if ($route -notmatch 'proposed\.exchange_rate') {
    Write-Host "X vendor correction route not whitelisting exchange_rate" -ForegroundColor Red; exit 1
}
Write-Host "+ correction route whitelists currency + FX" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_538.txt"
    $msgLines = @(
        'fix(payments): v3.74.538 - vendor payment correction handles FX end-to-end',
        '',
        'Three FX bugs in execute_vendor_payment_correction (DB function)',
        'plus a whitelist gap in the request route:',
        '',
        '  DB.1 rollback of bills.paid_amount used original.amount (raw)',
        '       instead of base_currency_amount - bill balance drifted.',
        '  DB.2 new JE lines used raw new amount, not base - repeated',
        '       the same trial-balance corruption v3.74.532 closed.',
        '  DB.3 new payment row forced into base currency, ignoring the',
        '       users proposed original_currency + exchange_rate.',
        '  DB.4 v_has_changes was blind to currency/rate changes.',
        '  API  whitelist did not include currency / exchange_rate so',
        '       those never reached the DB function.',
        '',
        'All four DB bugs fixed in the migration (applied on prod).',
        'Route now forwards original_currency + exchange_rate.',
        '',
        'Files',
        '  supabase/migrations/20260706000538_...sql',
        '  app/api/payments/[id]/vendor-request-correction/route.ts',
        '  lib/version.ts -> 3.74.538'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.538 pushed - correction flow FX-honest" -ForegroundColor Green
}
