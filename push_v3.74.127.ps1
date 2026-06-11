$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.126.ps1") { Remove-Item -LiteralPath "push_v3.74.126.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.127"') { Write-Host "+ 3.74.127" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.127 Level 2 - vendor payment correction workflow

Level 1 (v3.74.126) only ported the supplier-side READ logic (column
classification, void-row visual cues). User tested it but saw no
difference because their test data had no void/refund rows. The
visible parity gap was Delete button still on supplier rows where
the customer side replaced it with Request correction in v3.74.105.

Level 2 closes that gap end-to-end. Posted supplier payments are now
immutable on the UI; the only way to change them is through a
documented workflow that produces a reversal + audit trail.

DB (migrations applied):
- vendor_payment_correction_requests table (mirror of
  customer_refund_requests, supplier/bill instead of customer/invoice)
- 3 RLS policies: company members can SELECT/INSERT; owner/GM only
  can UPDATE — matching the customer side exactly.
- create_vendor_payment_correction_request RPC (SECURITY DEFINER).
  Same validation: reason >= 5 chars, payment not already voided,
  no duplicate pending/approved request. Adds NOT_VENDOR_PAYMENT
  guard for cross-tab safety.
- execute_vendor_payment_correction RPC. Posts the reversal journal,
  inserts a VOID payment row (negative amount linked to original),
  rolls back bills.paid_amount/status, and when proposed_changes is
  non-empty also posts a new payment + new journal with the corrected
  fields. AP account discovery uses code 2110 first, sub_type
  'accounts_payable' second, name match third.

API (4 new endpoints):
- POST /api/payments/:id/vendor-request-correction
- POST /api/vendor-payment-correction-requests/:id/approve   (owner/GM)
- POST /api/vendor-payment-correction-requests/:id/reject    (owner/GM)
- POST /api/vendor-payment-correction-requests/:id/execute
  (requester OR owner/GM, but approver != executor — SoD)

UI:
- /vendor-payment-correction-requests page: status cards + list +
  per-row Approve/Reject/Execute buttons + reject dialog + Realtime
  subscription on the table for auto-refresh.
- /payments supplier section: Delete button replaced with Request
  correction button (same amber styling and Dialog reuse as customer
  side). Existing correction Dialog now routes its POST to the
  vendor endpoint when correctionPayment.supplier_id is set.
- lib/notification-routing.ts: vendor_payment_correction_request
  reference_type maps to the new page with status filter derived
  from the event_key suffix, matching the customer pattern.

No data migration needed. Existing supplier payments continue to
work; the only behavior change is that Delete is gone and the
corrective workflow takes its place." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.127 pushed" -ForegroundColor Green
}
