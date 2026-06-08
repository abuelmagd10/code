# v3.74.100 - Cash overdraft validator mixed-ccy fix
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.99.ps1") { Remove-Item -LiteralPath "push_v3.74.99.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.100"') { Write-Host "+ APP_VERSION = 3.74.100" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.100" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.100]')) { Write-Host "+ CHANGELOG 3.74.100" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.100" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(accounting): v3.74.100 - cash overdraft validator mixed-ccy bug

Symptom: Customer credit refund from VitaSlims 1001 (خزينة الشركة
مدينة نصر) rejected with 'balance -0.80, required 5.00' even though
GL balance was +31.68 EGP.

Root cause: cash-balance-validator.ts treated any account with a
non-null original_currency as FC. That made it sum original_debit/
credit across journal lines recorded in different transaction
currencies. A 0.20 USD payment posted to an EGP cash account left
its 0.20 on original_debit, mixed with 1.00 EGP from another line
and NULL on the rest - producing a meaningless -0.80 'native_balance'.

Fix: load company.base_currency and only treat account as FC when
original_currency != base_currency. EGP cash accounts in EGP
companies now correctly use the base balance (+31.68).

Files: lib/accounting/cash-balance-validator.ts (load base_currency
+ tighten accIsFC condition)

Impact: all cash-outflow services (refunds, supplier payments,
expenses, drawings, bank transfers, payroll) on base-currency
cash/bank accounts in any company that has at least one FC
transaction. No data migration needed - validator now reads
correctly on next call." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.100 pushed" -ForegroundColor Green
}
