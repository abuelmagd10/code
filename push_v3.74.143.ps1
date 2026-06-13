$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.142.ps1") { Remove-Item -LiteralPath "push_v3.74.142.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.143"') { Write-Host "+ 3.74.143" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.143 - drop duplicate payment-approval pings

User reported during testing: accountant recorded a supplier payment,
the approval-request notification arrived TWICE in the owner inbox.

Root cause is the same pattern fixed in v3.74.133/138 for the
procurement cycle. notifyApprovalRequested called
resolveLevel1ApproverRecipients which fans out to:
  owner + admin + general_manager + manager

The owner inbox surfaces admin and general_manager rows via role
inheritance, so a single payment landed as 2-4 duplicate cards.

Per spec the approver list is owner + manager only (manager in this
schema is the user-facing 'المدير العام'). Both dispatched company-
wide (no branch / cost-center scope) so the owner can act on payments
from any branch, and a future general manager will get one clean row
regardless of which branch the payment came from.

  lib/services/payment-approval-notification.service.ts
    - notifyApprovalRequested: replaced the single
      resolveLevel1ApproverRecipients dispatch with two explicit
      resolveRoleRecipients(['owner']) and
      resolveRoleRecipients(['manager']) dispatches, both with null
      branch / warehouse / cost-center scope.

Manual recovery for the in-flight payment 73a787e5: deleted the 3
extra rows assigned to admin/general_manager/manager and set the
owner row's branch_id to null so the user sees one card from now
on." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.143 pushed" -ForegroundColor Green
}
