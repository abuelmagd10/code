$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.135.ps1") { Remove-Item -LiteralPath "push_v3.74.135.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.136"') { Write-Host "+ 3.74.136" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.136 - accountant now receives bill-rejection notification

User reported in test 3: the Owner rejected the accountant's bill
edit but no notification reached the accountant who made the edit.

Root cause (two bugs in notifyBillAdminRejected):

  1) cost_center filter silently hid the role notification. The
     notification was created with branch_id + cost_center_id from
     the bill, but the accountant's company_members row has a
     different cost_center (the bill inherits CC from the PO/branch
     while the accountant's CC is their own). The dashboard's
     notification feed filters by branch + cost_center, so the row
     never appeared for the accountant who actually needed to fix
     the edit.

  2) The 'creator' user notification fired back at the owner. Bills
     auto-created from PO approval have created_by_user_id = the
     owner who approved the PO, not the accountant. So when the
     owner later rejected the accountant's edit, the function sent
     a 'you rejected this bill' ping to the owner themselves -
     duplicate noise.

Fixes in notifyBillAdminRejected:
  - costCenterId set to null on the accountant-role notification
    so any accountant on the bill's branch sees the rejection,
    regardless of which cost_center they're attached to.
  - Skip the creator-user notification when creatorUserId === actorId.
    The owner doesn't need to be told they themselves just rejected
    the bill.

Manual cleanup: cleared the cost_center on the in-flight BILL-0002
rejection notification and removed the owner's self-rejection ping,
so the accountant (foodcana1976) can immediately see the rejection
without having to wait for the next deploy." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.136 pushed" -ForegroundColor Green
}
