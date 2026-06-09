$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.104.ps1") { Remove-Item -LiteralPath "push_v3.74.104.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.105"') { Write-Host "+ APP_VERSION = 3.74.105" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.105 - payment correction workflow + immutable payments

Replace direct Edit/Delete on posted payments with a documented
Reversal workflow that goes through customer_refund_requests. This
matches how SAP/Oracle/NetSuite handle posted cash transactions
and keeps the audit trail intact.

DB:
- customer_refund_requests gains metadata jsonb + original_payment_id
  + reversal_payment_id + reversal_journal_entry_id + rejection_reason
- payments gains voided_by_payment_id + voids_payment_id + voided_at
  + voided_by + void_reason
- RPC create_payment_correction_request(company, payment, reason, user)
  files a pending request, refusing duplicates and already-voided rows
- RPC execute_payment_correction(request, company, executor) clones the
  original journal entry with debit/credit flipped, inserts a payment
  with negative amount linked to the original, updates invoice.paid_amount
  if the original was tied to one, and reverses customer_credit_ledger
  for credit-applied originals

API:
- POST /api/payments/[id]/request-correction creates the request
- /api/customer-refund-requests/[id]/approve now restricted to
  owner/general_manager (board-only sign-off)
- /api/customer-refund-requests/[id]/execute restricted to the same
  roles and delegates payment_correction source_type to the new RPC
  (no account selection needed - reversal reuses the original account)

UI (/payments):
- Delete button removed for posted customer payments
- Edit button kept but relabeled 'Edit notes' to set the expectation
  that sensitive fields must go through Request correction (Phase 3
  will harden the form to only persist notes/reference_number)
- New 'Request correction' button opens a reason prompt (min 5 chars)
  and posts to the new endpoint" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.105 pushed" -ForegroundColor Green
}
