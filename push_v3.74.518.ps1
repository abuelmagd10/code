$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.517.ps1") { Remove-Item -LiteralPath "push_v3.74.517.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.518"') {
    Write-Host "+ 3.74.518" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pay = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($pay -notmatch 'displayCurrency') {
    Write-Host "X payments table display currency not separated" -ForegroundColor Red; exit 1
}
if ($pay -match 'renderPaymentAmount\(p, paymentCurrency\)') {
    Write-Host "X renderPaymentAmount still keyed to the form currency" -ForegroundColor Red; exit 1
}
Write-Host "+ table shows base-currency figures with the correct symbol regardless of form currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_518.txt"
    $msgLines = @(
        'fix(payments): v3.74.518 - table currency symbol independent of form',
        '',
        'Owner paid USD (exception path) and the payments table rendered',
        '"4.93 $" and net bill "6.31 $" - base-currency (EGP) figures with',
        'a dollar sign. The page reused ONE paymentCurrency state for both',
        'the entry form and the table symbol, so switching the form to USD',
        'flipped the whole table symbol.',
        '',
        '- New displayCurrency state follows the APP currency only',
        '  (init + app_currency_changed listener); table symbol and',
        '  display-amount pick use it.',
        '- renderPaymentAmount now receives the company baseCurrency for',
        '  FC detection instead of the mutable form currency, so an FX',
        '  payment renders as "0.10 $ / approx 4.93 EGP" and EGP rows keep EGP.',
        '',
        'Files',
        '  app/payments/page.tsx',
        '  lib/version.ts -> 3.74.518'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.518 pushed - payment amounts read correctly" -ForegroundColor Green
}
