# v3.74.22 + v3.74.23 + v3.74.24 + v3.74.25 - combined approval-coverage audit closure
# (Bundled because the per-file edits for these four releases all landed
# on disk together before push_v3.74.21 ran, and only v3.74.21's own
# files made it into that commit. This script ships everything else as
# one consolidated commit titled v3.74.25 - the final release in the
# audit-closure series.)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.25"') {
    Write-Host "+ APP_VERSION = 3.74.25" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.25" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($v in @('3.74.22', '3.74.23', '3.74.24', '3.74.25')) {
    if ($cl -match [regex]::Escape("[$v]")) {
        Write-Host "+ CHANGELOG entry for $v present" -ForegroundColor Green
    } else {
        Write-Host "X CHANGELOG missing $v" -ForegroundColor Red; exit 1
    }
}

# v3.74.22 spot checks
$v22 = @{
    "app/api/manufacturing/bom-versions/[id]/submit-approval/route.ts"      = 'bom_v_submitted_owner_'
    "app/api/manufacturing/production-orders/[id]/submit-approval/route.ts" = 'po_submitted_mgr_'
    "app/api/manufacturing/routing-versions/[id]/submit-approval/route.ts"  = 'rv_submitted_mgr_'
    "lib/notification-helpers.ts"                                            = "approverRoles = \['owner', 'admin', 'general_manager', 'manager'\]"
    "lib/services/write-off-notification.service.ts"                         = 'resolveLevel1ApproverRecipients'
    "lib/services/purchase-order-notification.service.ts"                    = 'resolveLevel1ApproverRecipients'
    "lib/services/sales-invoice-warehouse-command.service.ts"                = 'resolveLevel1ApproverRecipients'
    "app/expenses/[id]/page.tsx"                                             = 'branchAccountants'
    "lib/services/bill-receipt-notification.service.ts"                      = 'owner.+admin.+general_manager.+manager'
    "app/api/permissions/transfer/route.ts"                                  = "permission_transfer:.*:pending:role:"
}
Write-Host "`n--- v3.74.22 checks ---" -ForegroundColor DarkCyan
foreach ($k in $v22.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $v22[$k]) {
        Write-Host "  + $k" -ForegroundColor Green
    } else {
        Write-Host "  X $k - pattern not found" -ForegroundColor Red
        exit 1
    }
}

# v3.74.23 spot checks
$v23 = @{
    "app/api/customer-refund-requests/[id]/approve/route.ts" = 'approved_requester'
    "app/api/customer-refund-requests/[id]/reject/route.ts"  = 'rejected_requester'
    "app/api/permissions/transfer/[id]/approve/route.ts"     = 'تم اعتماد طلب نقل الصلاحيات'
    "app/api/permissions/transfer/[id]/reject/route.ts"      = 'تم رفض طلب نقل الصلاحيات'
}
Write-Host "`n--- v3.74.23 checks ---" -ForegroundColor DarkCyan
foreach ($k in $v23.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $v23[$k]) {
        Write-Host "  + $k" -ForegroundColor Green
    } else {
        Write-Host "  X $k - pattern not found" -ForegroundColor Red
        exit 1
    }
}

# v3.74.24 spot checks (the bill-receipt one is shared with v3.74.22 above
# but a distinct call site - the receipt-rejected fanout, not the
# approval-restart fanout)
$v24 = @{
    "app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts" = '"owner", "admin", "general_manager", "manager"'
}
Write-Host "`n--- v3.74.24 checks ---" -ForegroundColor DarkCyan
foreach ($k in $v24.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $v24[$k]) {
        Write-Host "  + $k" -ForegroundColor Green
    } else {
        Write-Host "  X $k - pattern not found" -ForegroundColor Red
        exit 1
    }
}

# v3.74.25 spot checks
$bv = Get-Content -LiteralPath "lib/services/bank-voucher-notification.service.ts" -Raw
if (([regex]::Matches($bv, 'resolveBranchAccountantRecipients')).Count -ge 2) {
    Write-Host "`n+ bank-voucher service includes accountant in 2 places (v3.74.25)" -ForegroundColor Green
} else {
    Write-Host "X bank-voucher service is missing the accountant additions" -ForegroundColor Red
    exit 1
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
    git commit -m "feat(notifications): v3.74.22-25 - close approval-coverage audit across all 17 workflows

Bundled commit shipping four planned releases (CRITICAL, HIGH,
MEDIUM, LOW) that landed on disk together. The per-stage push
scripts (push_v3.74.22.ps1 through push_v3.74.25.ps1) each
require the on-disk version to match exactly; since version.ts
was already at 3.74.25 when v3.74.21 was committed, the staged
scripts couldn't run sequentially. This consolidated script
verifies the markers from all four stages and commits as the
final v3.74.25 release.

The four stages, all rooted in the v3.74.21 audit:

v3.74.22 CRITICAL - owner / manager dropped from approval recipients
across 10 workflows. Same root cause as v3.74.20: helpers used
hardcoded subsets of ['admin','general_manager'] etc. and silently
relied on RPC fan-out that doesn't exist. Switched the following to
the canonical resolveLevel1ApproverRecipients (or its inline
equivalent):

  - mfg bom-versions submit (added owner)
  - mfg production-orders submit (added manager)
  - mfg routing-versions submit (added manager)
  - customer-refund-requests creation (full L1 list)
  - write-offs approval-request + modified (2 call sites)
  - purchase-orders approval-request
  - invoices warehouse approve/reject (3 spots)
  - expenses pending-approval (added manager)
  - bills approval-restart-after-rejection
  - permissions/transfer submission (no notification existed at all)

v3.74.23 HIGH - originator not told the decision result.
Four workflows the audit flagged where the next-stage actor or
audit log got a notification but the requester didn't. Three needed
fixing; the fourth (mfg material-issue-approvals) already targeted
approval.requested_by on re-inspection.

  - customer-refund-requests approve + reject (originator told,
    self-approval guard preserved)
  - permissions/transfer approve + reject (direct notifications
    INSERT, two-eye semantics preserved)

v3.74.24 MEDIUM - upstream approvers not told when a later stage
rejects. Three workflows updated; three audit candidates closed as
PASS on re-inspection because they were genuinely single-stage and
the originator notification (HIGH) is the only coverage needed.

  - notifyManagementPRWarehouseRejected fallback role-list
    expanded ['admin','general_manager'] -> full L1 tier
  - notifyReceiptRejected senior fanout
    ['owner','general_manager'] -> full L1 tier
  - mfg material-issue rejection senior fanout
    ['general_manager'] -> full L1 tier

v3.74.25 LOW - branch accountants added as approval recipients on
the two workflows that didn't already include them by convention.

  - bank-voucher-notification.service.ts:
    notifyApprovalRequested + archiveApprovalRequestNotifications
    both now include resolveBranchAccountantRecipients
  - expenses page.tsx: added a second company_members query for
    branch accountants and merged into allRecipients before the
    per-user notification loop

Series wrap-up: v3.74.21 through v3.74.25 brought every approval
workflow in the project into compliance with the canonical rule:
 (1) Level-1 requests reach the full senior tier including owner
 (2) every decision reaches the originator
 (3) every later-stage rejection reaches upstream approvers
 (4) branch accountants are notified by convention everywhere
Audit closed.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22-25 (consolidated) pushed" -ForegroundColor Green
}
