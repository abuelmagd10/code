$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.130.ps1") { Remove-Item -LiteralPath "push_v3.74.130.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.131"') { Write-Host "+ 3.74.131" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(procurement): v3.74.131 - tighten PO approval + single-click bill send

Per user spec on the full P2P cycle:
  1) المالك + المدير العام (owner + manager) can create POs in addition
     to مسؤول المشتريات (purchasing_officer) and المحاسب (accountant)
  2) PO approval is restricted to owner + manager only; admin and
     other roles still receive the visibility notification but no
     longer see approve/reject buttons or have RPC authority
  3) The branch accountant sends a draft bill to warehouse receipt
     with one button instead of two (the old approve + submit flow)

DB (migration v3_74_131_po_approval_owner_manager_only):
- Grants purchase_orders write/update/read access to manager,
  accountant, purchasing_officer per company. owner was already there.
- Replaces approve_purchase_order_atomic: role check is now
  v_user_role IN ('owner', 'manager'). admin (was in the list) is
  removed. The dead 'general_manager' / 'gm' entries that the old
  code was checking are dropped - the schema's role check constraint
  doesn't include them, so they were never reachable anyway. Bill
  insert still uses status='draft' / approval_status='pending'
  (carried forward from v3.74.130).

Service (lib/services/bill-receipt-workflow.service.ts):
- submitForReceipt no longer throws 'Bill must be approved first'
  when the bill is still draft+pending. It now auto-sets
  approval_status='approved' + approved_by + approved_at inside the
  same UPDATE so the audit trail stays consistent and the rest of
  the workflow (notifications, confirm-receipt, accrual) sees the
  state it expects. The actor's role is gated by SUBMISSION_ROLES
  at the top of the function so this isn't a privilege leak.

UI:
- app/purchase-orders/[id]/page.tsx: approve/reject buttons now only
  show when userContext.role === 'owner' OR 'manager'. admin gets the
  notification (visibility) but the buttons are hidden.
- app/bills/[id]/page.tsx: removed the client-side 'must be approved'
  guard before submit-for-receipt and changed the button condition
  from (approved) to (status === 'draft'), so the accountant now sees
  a single 'إرسال للاستلام المخزنى' button on a draft+pending bill.

Next release will audit the warehouse approval/rejection notification
fan-out (must reach: PO creator + branch accountant + owner + manager)
and the edit-after-rejection cycle the user described in the spec." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.131 pushed" -ForegroundColor Green
}
