$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.102.ps1") { Remove-Item -LiteralPath "push_v3.74.102.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.103"') { Write-Host "+ APP_VERSION = 3.74.103" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.103" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(payments): v3.74.103 - refund row shows source invoice from return

In /payments, a customer credit refund used to render as 'Credit
refund' with no clue where the credit originally came from. Now the
row pulls the originating invoice number out of the payment notes
and shows '(from return INV-00004)' next to the badge, so a user
auditing the payment ledger can trace the disbursement back to the
sale return that funded it without opening anything else.

Backend (lib/services/customer-refund-command.service.ts):
- recordRefund now looks at the customer_credits rows it consumed
  and enriches the payment notes with '(مَصدَر الرَّصيد: مَرتَجَع
  INV-XXX[, INV-YYY...])'. The credit notes already mention the
  source invoice in plain text since v3.74.91, so a regex pull is
  enough - no extra FK is needed.

UI (app/payments/page.tsx):
- The 'Credit refund' cell parses INV-XXX out of p.notes and renders
  '(from return INV-XXX)' inline. The full notes string is the
  cell's title so hovering shows the complete description.

DB backfill: VitaSlims refund payment (محمد بسيونى, 5 EGP) had its
notes rewritten to mention INV-00004 explicitly." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.103 pushed" -ForegroundColor Green
}
