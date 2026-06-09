$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.113.ps1") { Remove-Item -LiteralPath "push_v3.74.113.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.114"') { Write-Host "+ 3.74.114" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(refund-requests): v3.74.114 - propose + approve + apply correction

Until now Request correction just gave the approver a reason; on
approval the system reversed the payment and that was it. The user
asked for a real two-sided workflow: the requester says exactly what
the payment SHOULD look like, the approver sees the diff, the system
applies it.

DB (migration v3_74_114_payment_correction_proposed_changes):
- create_payment_correction_request now takes p_proposed_changes
  jsonb and stores it in metadata alongside an 'original_*' snapshot
  of every field that can be changed.
- execute_payment_correction still posts the reversal of the original
  (so books stay clean). When proposed_changes is non-empty it then
  posts a brand-new payment with the proposed amount, date, account,
  method, reference and notes, and a matching journal entry. The
  invoice paid_amount is rolled back for the original and rolled
  forward for the new payment. The request row stores new_payment_id
  and new_journal_entry_id in metadata for audit.

API:
- /api/payments/[id]/request-correction now accepts proposedChanges,
  sanitises it to a whitelist (amount/payment_date/account_id/
  payment_method/reference_number/notes), and forwards it to the RPC.

UI (/payments):
- Replaced the two window.prompt() handlers with a real dialog. The
  dialog shows the original payment on top, requires a reason >= 5
  chars, and offers six optional inputs prefilled with the original
  values. We only send fields the user actually changed.

UI (/customer-refund-requests):
- The Reason cell now shows a 'Proposed changes' callout listing the
  before -> after diff (amount, date, method, account, reference,
  notes) so the approver decides knowingly." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.114 pushed" -ForegroundColor Green
}
