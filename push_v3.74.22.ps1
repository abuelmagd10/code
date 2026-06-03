# v3.74.22 - CRITICAL: owner/manager dropped from approval recipients across 10 workflows
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.22"') {
    Write-Host "+ APP_VERSION = 3.74.22" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.22" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.22\]' -and $cl -match 'ten workflows') {
    Write-Host "+ CHANGELOG entry for 3.74.22 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.22" -ForegroundColor Red; exit 1
}

# Spot-check the 10 touchpoints
$checks = @{
    "app/api/manufacturing/bom-versions/[id]/submit-approval/route.ts"      = 'bom_v_submitted_owner_'
    "app/api/manufacturing/production-orders/[id]/submit-approval/route.ts" = 'po_submitted_mgr_'
    "app/api/manufacturing/routing-versions/[id]/submit-approval/route.ts"  = 'rv_submitted_mgr_'
    "lib/notification-helpers.ts"                                            = "approverRoles = \['owner', 'admin', 'general_manager', 'manager'\]"
    "lib/services/write-off-notification.service.ts"                         = 'resolveLevel1ApproverRecipients'
    "lib/services/purchase-order-notification.service.ts"                    = 'resolveLevel1ApproverRecipients'
    "lib/services/sales-invoice-warehouse-command.service.ts"                = 'resolveLevel1ApproverRecipients'
    "app/expenses/[id]/page.tsx"                                             = '"owner", "admin", "general_manager", "gm", "generalmanager", "manager"'
    "lib/services/bill-receipt-notification.service.ts"                      = '"owner", "admin", "general_manager", "manager"'
    "app/api/permissions/transfer/route.ts"                                  = "permission_transfer:.*:pending:role:"
}
foreach ($k in $checks.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $checks[$k]) {
        Write-Host "  + $k" -ForegroundColor Green
    } else {
        Write-Host "  X $k — pattern not found" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(notifications): v3.74.22 - widen approval recipient lists across 10 workflows

The v3.74.21 audit found the same hardcoded-recipient bug pattern
v3.74.20 fixed for sales-return-requests repeated across nine more
workflows. In every case the recipient list was a hand-typed subset
of ['admin','general_manager'], ['owner','general_manager'], [admin],
etc., silently dropping at least one role from the canonical Level-1
approver tier (owner + admin + general_manager + branch manager).
In small companies whose only senior member is the owner, OR whose
branch decisions belong to the branch manager rather than head office,
the corresponding approval notifications reached nobody and the
workflow stalled with no inbox signal.

This is purely a notification-coverage bug. The approval permission
logic was always correct - only the recipient list drifted from it.
No new approvers gain access; we only widen who hears about pending
requests.

Ten files updated:

  1. mfg bom-versions submit-approval - added owner
  2. mfg production-orders submit-approval - added manager
  3. mfg routing-versions submit-approval - added manager
  4. customer-refund-requests creation - full L1 list (owner+admin+gm+mgr)
  5. write-offs approval-request + modified (2 call sites)
     resolveLeadershipVisibilityRecipients -> resolveLevel1ApproverRecipients
  6. purchase-orders approval-request
     resolveLeadershipVisibilityRecipients() -> resolveLevel1ApproverRecipients(branchId,..)
  7. invoices warehouse approve/reject (3 spots)
     resolveExecutiveRecipients() -> resolveLevel1ApproverRecipients(branch,wh,null)
  8. expenses pending-approval - added 'manager' to the direct
     company_members .in() role list
  9. bills approval-restart-after-rejection
     ['owner','general_manager'] -> ['owner','admin','general_manager','manager']
 10. permissions/transfer submission - NO notification existed at all.
     Added per-role insert into notifications for owner/admin/gm.
     Two-eye rule preserved (enforced by approve route, not notification).

What didn't change:
 - Branch-scoped helpers (bank-voucher, booking) that intentionally
   target only the branch manager were left untouched.
 - Authorization stays as it was; we only widened the audience.
 - resolveExecutiveRecipients + resolveLeadershipVisibilityRecipients
   are still exported - they have other valid callers.

Files:
  Modified: 10 source files (listed above)
  Modified: lib/version.ts (3.74.21 -> 3.74.22)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22 pushed" -ForegroundColor Green
}
