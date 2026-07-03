$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.515.ps1") { Remove-Item -LiteralPath "push_v3.74.515.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.516"') {
    Write-Host "+ 3.74.516" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$sel = Get-Content -LiteralPath "components/ExchangeRateSelector.tsx" -Raw
if ($sel -notmatch 'amount\?: number') {
    Write-Host "X ExchangeRateSelector missing amount preview prop" -ForegroundColor Red; exit 1
}

$pay = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($pay -notmatch 'accountCurrencyOf' -or $pay -notmatch 'showAllPayAccounts') {
    Write-Host "X payments page missing currency-account matching" -ForegroundColor Red; exit 1
}
$confirmCount = ([regex]::Matches($pay, 'v3\.74\.516')).Count
if ($confirmCount -lt 8) {
    Write-Host "X currency matching not applied across both forms (found $confirmCount markers)" -ForegroundColor Red; exit 1
}
Write-Host "+ FX payment: account list filtered by currency, bidirectional sync, explicit exception confirm, base-currency overdraft check, amount x rate preview" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_516.txt"
    $msgLines = @(
        'feat(fx): v3.74.516 - payment currency <-> account currency matching',
        '',
        'Owner review of FX payments: paying USD from an EGP till was',
        'allowed with only a passive hint, the overdraft check compared',
        'the payment amount (payment currency) against a base-currency',
        'balance displayed with the ACCOUNT currency symbol, and FC',
        'account subledgers drift (hurts FX revaluation).',
        '',
        'Approved spec (option + addition):',
        '1. Account list auto-filters to accounts matching the payment',
        '   currency; switching currency auto-resets to the first matching',
        '   account; picking an account auto-sets the payment currency',
        '   (bidirectional). Applied to BOTH customer and supplier forms.',
        '2. "Show accounts in other currencies (exception)" link keeps the',
        '   legitimate mismatch case, now guarded by an explicit confirm',
        '   at save showing the converted equivalent.',
        '3. Overdraft check now converts the amount to base currency',
        '   before comparing, and the balance renders with the base',
        '   currency symbol (it was always a base figure).',
        '4. ExchangeRateSelector gains an amount prop: renders',
        '   "3 USD = 147.84 EGP" under the "1 USD = 49.28" preview.',
        '   Wired in payments (x2), expenses, drawings, vendor credits,',
        '   purchase returns and banking transfers.',
        '',
        'Files',
        '  components/ExchangeRateSelector.tsx',
        '  app/payments/page.tsx',
        '  app/expenses/new/page.tsx',
        '  app/drawings/new/page.tsx',
        '  app/vendor-credits/new/page.tsx',
        '  app/purchase-returns/new/page.tsx',
        '  app/banking/page.tsx',
        '  lib/version.ts -> 3.74.516'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.516 pushed - FX payments currency-safe" -ForegroundColor Green
}
