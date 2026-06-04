# v3.74.43-44 - bundle RLS audit + customer edit lock extension
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.44"') {
    Write-Host "+ APP_VERSION = 3.74.44" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.44" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($vv in @('3.74.43','3.74.44')) {
    if ($cl -match [regex]::Escape("[$vv]")) {
        Write-Host "+ CHANGELOG $vv" -ForegroundColor Green
    } else { Write-Host "X CHANGELOG missing $vv" -ForegroundColor Red; exit 1 }
}

# v3.74.44 marker check on the customer-form-dialog
$cfd = Get-Content -LiteralPath "components/customers/customer-form-dialog.tsx" -Raw
if ($cfd -match 'isCustomerLocked\s*=\s*hasActiveInvoices\s*\|\|\s*hasCreditBalance\s*\|\|\s*hasReceivable') {
    Write-Host "+ isCustomerLocked derivation present" -ForegroundColor Green
} else { Write-Host "X isCustomerLocked derivation missing" -ForegroundColor Red; exit 1 }
if ($cfd -match 'setHasCreditBalance' -and $cfd -match 'setHasReceivable') {
    Write-Host "+ credit + receivable state setters present" -ForegroundColor Green
} else { Write-Host "X state setters missing" -ForegroundColor Red; exit 1 }
if ($cfd -match 'dataForUpdate\s*=\s*isCustomerLocked') {
    Write-Host "+ dataForUpdate uses isCustomerLocked" -ForegroundColor Green
} else { Write-Host "X dataForUpdate still on hasActiveInvoices" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat: v3.74.43-44 - pre-launch RLS audit + extended customer edit lock

v3.74.43 (DB-only, already applied):
  - 9 unprotected tables given RLS policies (incl. critical
    employee_contracts with HR salary data).
  - inventory_transfers had two overlapping CHECK constraints on
    status; consolidated into one.

v3.74.44 (this code change):
  - Customer edit dialog now locks name/phone/email/tax_id/credit_limit
    fields when the customer has any of: active invoices, unused
    credit balance (from returns), or outstanding receivable.
    Previously only the invoice case was locked.
  - Warning box lists each active reason with figures so the user
    knows exactly why fields are disabled.
  - Address fields remain editable in all cases.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.43-44 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.43.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.43.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.43.ps1)" -ForegroundColor DarkGray
    }
}
