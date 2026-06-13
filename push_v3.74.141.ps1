$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.140.ps1") { Remove-Item -LiteralPath "push_v3.74.140.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.141"') { Write-Host "+ 3.74.141" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.141 - rejection of bill edit goes to the actual editor

User reported during testing: accountant edited the bill, owner
rejected the edit, but the 'تم رفض فاتورة المشتريات' notification
went to the PURCHASING OFFICER (PO creator) instead of the
accountant who made the edit.

Spec for Step 6 (bill edit rejected) says 'notify the creator only',
where 'creator' actually means the person who made the change that
was rejected — i.e. whoever just edited the bill. v3.74.138 had
already pivoted from bills.created_by_user_id (which is the owner
who auto-approved the PO) to purchase_orders.created_by_user_id
(the purchasing officer), but that's still wrong for the edit
scenario: the bill could be edited by the accountant, and they're
the one who needs to see the rejection so they can fix it.

Fix:

  DB migration v3_74_141_bills_last_edited_by
    - Adds bills.last_edited_by_user_id uuid (nullable).

  app/bills/[id]/edit/page.tsx
    - On save, reads supabase.auth.getUser() and writes
      last_edited_by_user_id = current user's id alongside the
      rest of the bill update.

  lib/services/bill-receipt-workflow.service.ts
    - loadBill SELECT now includes last_edited_by_user_id.
    - BillRecord type updated.

  lib/services/bill-receipt-notification.service.ts
    - BillReceiptNotificationBill type adds the column.
    - notifyBillAdminRejected now resolves the recipient in this
      order:
        1) last_edited_by_user_id (the editor)
        2) purchase_orders.created_by_user_id (PO creator)
        3) bills.created_by_user_id (last-resort fallback)
      so the editor gets the rejection when the column is set,
      and legacy bills still degrade safely to the PO-creator path
      from v3.74.138.

Manual recovery for the in-flight BILL-0002 case:
  - Reassigned the 'تم رفض فاتورة المشتريات' notification
    (id 3961796a) from the purchasing officer to the accountant
    (foodcana1976) so the user can see the corrected behaviour
    immediately.
  - Wrote last_edited_by_user_id on BILL-0002 to point at the
    accountant for the upcoming test cycle, so any further reject
    in this thread reaches the right person." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.141 pushed" -ForegroundColor Green
}
