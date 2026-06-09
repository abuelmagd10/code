$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.103.ps1") { Remove-Item -LiteralPath "push_v3.74.103.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.104"') { Write-Host "+ APP_VERSION = 3.74.104" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.104" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(payments): v3.74.104 - refund label distinguishes return vs overpayment

A customer credit can be born from two events:
1. A sales return that exceeded the invoice balance
2. An overpayment on an invoice (customer paid more than was due)

Both write 'INV-XXX' into customer_credits.notes and reference_type
tells them apart (invoice_return vs invoice_overpayment). Before this
release the refund notes and the /payments UI both said 'from return
INV-XXX' regardless, which was misleading whenever the credit had
originated as an overpayment.

Backend (lib/services/customer-refund-command.service.ts):
- Reads reference_type alongside notes when enriching refund payment
  notes; groups invoices into return-sourced vs overpayment-sourced
  and emits a combined phrase like:
    (مَصدَر الرَّصيد: مَرتَجَع INV-04 + زيادَة دَفع عَلى INV-03)

UI (app/payments/page.tsx):
- The 'Credit refund' cell picks 'from return', 'from overpayment',
  or generic 'source: INV-XXX' depending on which keyword the notes
  carry, in both Arabic and English." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.104 pushed" -ForegroundColor Green
}
