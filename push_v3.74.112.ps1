$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.111.ps1") { Remove-Item -LiteralPath "push_v3.74.111.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.112"') { Write-Host "+ 3.74.112" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(refund-requests): v3.74.112 - resolve source invoice for refund corrections

When you filed a correction on a refund row the Invoice column on
/customer-refund-requests stayed empty, even though /payments knew
the refund traced back to INV-XXX. The DB function was copying
payments.invoice_id directly, which is always NULL for refund and
standalone payments.

DB migration v3_74_112_correction_request_resolve_source_invoice
- create_payment_correction_request now falls back to scanning
  payment.notes for 'INV-N+' (the source invoice marker we already
  embed in v3.74.103/104) and looks the id up in invoices via
  invoice_number. The resolved id also lands in metadata.source_
  invoice_id so the approver can audit it.
- Backfilled the one existing request whose Invoice cell was blank
  (refund of credit from INV-00004)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.112 pushed" -ForegroundColor Green
}
