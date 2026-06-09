$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.109.ps1") { Remove-Item -LiteralPath "push_v3.74.109.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.110"') { Write-Host "+ 3.74.110" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(payments): v3.74.110 - refund rows get Edit notes + Request correction

The /payments table treated refund payments (amount<0) as 'view-only'
because the original v3.74.105 patch was worried about double-actions.
But a refund can also be filed by mistake (wrong customer, wrong
amount, wrong account), and the user pointed out the correct fix is
the same governance-managed workflow we already built.

Surface Edit notes and Request correction on refund rows too. The
DB layer needs no change: create_payment_correction_request uses
ABS(amount) so it handles negative payments, and execute_payment_
correction posts a payment with -original_amount and swapped
debit/credit journal lines, so reversing a -5 refund posts a +5
payment + journal that restores the customer's credit." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.110 pushed" -ForegroundColor Green
}
