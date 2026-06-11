$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.128.ps1") { Remove-Item -LiteralPath "push_v3.74.128.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.129"') { Write-Host "+ 3.74.129" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(purchases): v3.74.129 - notify branch accountant when draft bill is created from approved PO

User report: 'مسؤول المشتريات أنشأ PO تابع لفرعه. أُرسل إشعار للمالك
والمدير العام، اعتمدوه، فأُنشئت فاتورة مشتريات بحالة مسودة، لكن لم
يصل إشعار لمحاسب الفرع بوجود فاتورة جديدة لاعتمادها واستكمال دورة
الشراء.'

Verified on PO-0002 / BILL-0002: of all notifications dispatched at
PO approval, the recipients were creator + leadership (admin / owner
/ GM) only. The branch accountant who actually needs to post the AP
journal entry was never told. Workflow stalled silently.

Root cause: PurchaseOrderNotificationService.notifyApprovedWorkflow
sent two notifications (creator + leadership visibility) and stopped.
It received linkedBillId from the route and put it on the creator's
notification, but never fanned out to the accountant role tied to
the bill's branch.

Fix: add a third dispatch block in notifyApprovedWorkflow that fires
only when linkedBillId is present, using resolveRoleRecipients
(['accountant'], branchId, null, costCenterId) so the recipient list
respects the existing branch-scoped fan-out logic. The notification
deep-links to /bills/<id> via reference_type='bill' and the existing
routing map, lands the accountant on the right row, and carries
category='approvals' so it shows up on their approvals badge.

Backfill: created the missing notification for BILL-0002
(notification id 21e344e8-7c36-40d6-b149-417f16629bc4) so the
accountant on branch a882b22d can actually test the fix end-to-end
on existing data.

No DB schema changes. No RLS changes. Single-file code change in
lib/services/purchase-order-notification.service.ts." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.129 pushed" -ForegroundColor Green
}
