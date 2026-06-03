# v3.74.22 + v3.74.23 + v3.74.24 + v3.74.25 + v3.74.26 - bundled push
# (Supersedes push_v3.74.22-25.ps1. The per-stage scripts couldn't run
# sequentially because version.ts had already advanced past each stage's
# expected value before its push ran. This script verifies markers for
# all five stages and commits them as one consolidated release titled
# v3.74.26 - the security fix that closes the bundle.)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.26"') {
    Write-Host "+ APP_VERSION = 3.74.26" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.26" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($v in @('3.74.22', '3.74.23', '3.74.24', '3.74.25', '3.74.26')) {
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
    } else { Write-Host "  X $k" -ForegroundColor Red; exit 1 }
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
    } else { Write-Host "  X $k" -ForegroundColor Red; exit 1 }
}

# v3.74.24 spot check
$v24 = Get-Content -LiteralPath "app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts" -Raw
if ($v24 -match '"owner", "admin", "general_manager", "manager"') {
    Write-Host "`n+ v3.74.24 mfg material-issue reject expanded recipient list" -ForegroundColor Green
} else { Write-Host "X v3.74.24 marker missing" -ForegroundColor Red; exit 1 }

# v3.74.25 spot check
$bv = Get-Content -LiteralPath "lib/services/bank-voucher-notification.service.ts" -Raw
if (([regex]::Matches($bv, 'resolveBranchAccountantRecipients')).Count -ge 2) {
    Write-Host "+ v3.74.25 bank-voucher service has accountant in 2 places" -ForegroundColor Green
} else { Write-Host "X v3.74.25 marker missing" -ForegroundColor Red; exit 1 }

# v3.74.26 spot checks
$srLib = Get-Content -LiteralPath "lib/sales-return-requests.ts" -Raw
if ($srLib -match "SALES_RETURN_VIEWER_ROLES\s*=\s*\[\s*'accountant'\s*\,") {
    Write-Host "`n+ v3.74.26 SALES_RETURN_VIEWER_ROLES introduced" -ForegroundColor Green
} else { Write-Host "X v3.74.26 viewer role missing" -ForegroundColor Red; exit 1 }
# Approver list now has 4 roles, not 5 (accountant removed)
if ($srLib -match "SALES_RETURN_LEVEL1_APPROVER_ROLES\s*=\s*\[\s*'owner',\s*'admin',\s*'general_manager',\s*'manager',\s*\]") {
    Write-Host "+ v3.74.26 accountant removed from L1 approver tier" -ForegroundColor Green
} else { Write-Host "X v3.74.26 accountant still in L1 approver list" -ForegroundColor Red; exit 1 }
$srPage = Get-Content -LiteralPath "app/sales-return-requests/page.tsx" -Raw
if ($srPage -match "SALES_RETURN_VIEWER_ROLES") {
    Write-Host "+ v3.74.26 page imports viewer role list" -ForegroundColor Green
} else { Write-Host "X v3.74.26 page does not import viewer roles" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(notifications, security): v3.74.22-26 - audit closure + SoD fix

Consolidated commit shipping five releases that accumulated on disk
together before any could be pushed individually:

v3.74.22 CRITICAL - owner/manager dropped from approval recipients
across 10 workflows. Same root cause as v3.74.20: helpers hardcoded
subsets like ['admin','general_manager'] and relied on RPC fan-out
that doesn't exist. Switched to canonical resolveLevel1ApproverRecipients
(or equivalent inline) across mfg bom/production/routing submits,
customer-refund creation, write-offs (2 sites), purchase-orders,
invoices warehouse (3 sites), expenses, bills, permissions/transfer
(which had no submission notification at all).

v3.74.23 HIGH - originator not told the decision result. Four
workflows where the next-stage actor got a notification but the
requester didn't. customer-refund-requests approve+reject added
originator notifications via create_notification RPC. permissions/
transfer approve+reject added direct notifications INSERTs (route
doesn't use the resolver). mfg material-issue-approvals already
correct on re-inspection.

v3.74.24 MEDIUM - upstream approvers not told when later stages
reject. Three real fixes: notifyManagementPRWarehouseRejected
fallback ['admin','general_manager'] -> full L1, notifyReceiptRejected
senior fanout ['owner','general_manager'] -> full L1, mfg
material-issue reject senior fanout ['general_manager'] -> full L1.
Three audit candidates closed as PASS (single-stage workflows where
originator is the only upstream).

v3.74.25 LOW - branch accountants added as approval recipients on
banking vouchers (notifyApprovalRequested + archive sweep) and
expenses (second company_members query merged into allRecipients).

v3.74.26 SECURITY - Ahmed found the accountant role seeing 'اعتماد
الإدارة' and 'رفض' buttons on sales-return-requests. The accountant
should not have approval power on sales returns (they reconcile the
resulting cash + inventory effects, so granting them approval means
one role can both authorize and post - separation-of-duties leak).

  - SALES_RETURN_LEVEL1_APPROVER_ROLES no longer contains
    'accountant'. New SALES_RETURN_VIEWER_ROLES = ['accountant']
    introduced as read-only tier.
  - Page imports the viewer list and adds it to both the data-fetch
    allowedRoles set and the access-gate isAllowedUser set, but
    canLevel1Act still keys on the approver list - so the button
    column disappears for accountant.
  - GET listing endpoint includes viewers (read-only). Approve and
    reject endpoints stay strict at the approver list, so the
    accountant gets HTTP 403 if they POST directly. Defense in depth.
  - pending-count badge short-circuits to 0 for accountant via the
    existing isLevel1 check. No sidebar badge for them.
  - Branch-scope checks (manager || accountant) simplified to just
    manager - accountant 403s upstream now.

The accountant still gets inbox notifications via the convention
helper resolveBranchAccountantRecipients - that path is independent
of the approver tier and is intentionally preserved so they keep
pre-staging-the-books visibility.

Series wrap-up: v3.74.21 through v3.74.26 brought every approval
workflow into compliance with the canonical notification rule, and
closed an unrelated SoD leak that surfaced during the test pass.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22-26 (consolidated) pushed" -ForegroundColor Green
}
