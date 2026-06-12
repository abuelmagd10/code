$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.131.ps1") { Remove-Item -LiteralPath "push_v3.74.131.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.132"') { Write-Host "+ 3.74.132" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.132 - bill edits on PO-linked draft force re-approval

Governance gap user flagged:
  1) مسؤول المشتريات creates PO
  2) Owner approves PO -> draft bill is auto-created with original_total
  3) Accountant opens the draft bill and edits totals (eg 4 EGP -> 100)
  4) Nothing notifies owner / manager; accountant could then click
     'Send for receipt' and the warehouse would post a 100 EGP AP
     entry on a 4 EGP approved PO.

User picked option (b): allow the edit but force the owner/manager to
re-review and re-approve before the bill can move forward.

DB (migration v3_74_132_bill_edit_requires_reapproval):
- BEFORE UPDATE trigger bills_force_reapproval_on_edit:
  * Skips bills whose status is past draft/approved (sent/received/etc.).
  * Skips manual bills (purchase_order_id NULL) so they keep using the
    normal approveBill route.
  * Compares NEW.subtotal / NEW.tax_amount / NEW.total_amount against
    the row's own original_subtotal / original_tax_amount /
    original_total snapshot taken at PO conversion. Any monetary delta
    > 0.001 flips status to 'pending_approval', approval_status to
    'pending', and clears approved_by/approved_at + rejected_*.
  * The original_* columns are intentionally NOT updated by the
    trigger, so the owner sees the original PO values to compare
    against the new totals on every re-edit.

Service (lib/services/bill-receipt-workflow.service.ts):
- ADMIN_APPROVAL_ROLES narrowed from owner/admin/general_manager to
  owner + manager only, matching the v3.74.131 PO approval gate.
  admin still gets the notification (visibility) but no longer holds
  the authority to approve a modified bill.

Edit page (app/bills/[id]/edit/page.tsx):
- needsApprovalRestart now also returns true when a draft bill that
  came from a PO has its totals changed against original_total. That
  matches the DB trigger's decision so the client correctly fires
  the existing /api/bills/[id]/restart-approval-notifications POST
  after the update lands.

API (app/api/bills/[id]/restart-approval-notifications/route.ts):
- Removed the hard 'receipt_status must be rejected' gate. The
  endpoint now accepts two cases:
    a) the original case (receipt_status='rejected' after warehouse
       rejected the goods, accountant re-edits)
    b) NEW: bill is PO-linked AND approval_status='pending' (the new
       trigger just flipped a draft into pending_approval because the
       accountant changed the totals)
  notifyApprovalRestartAfterReceiptRejection already fans out to
  owner + admin + general_manager + manager so the owner gets pinged.

End-to-end after this release:
  - Owner approves PO at 4 EGP -> bill draft 4 EGP, accountant gets
    'please approve and send for receipt' notification.
  - Accountant edits totals to 100 EGP, hits Save.
  - Trigger flips status to pending_approval; client fires the
    restart-approval-notifications call; owner + manager get
    'تعديل الفاتورة بانتظار الاعتماد'.
  - Until owner/manager approves the modified bill via approveBill,
    the 'Send for Receipt' button stays hidden (status not 'draft').
  - On approval the bill goes back to draft + approval_status=
    approved; accountant can then send for receipt as before." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.132 pushed" -ForegroundColor Green
}
