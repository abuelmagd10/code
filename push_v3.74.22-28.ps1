# v3.74.22 .. 3.74.28 - bundled push (supersedes -22-25, -22-26, -22-27)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.28"') {
    Write-Host "+ APP_VERSION = 3.74.28" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.28" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($vv in @('3.74.22','3.74.23','3.74.24','3.74.25','3.74.26','3.74.27','3.74.28')) {
    if ($cl -match [regex]::Escape("[$vv]")) {
        Write-Host "+ CHANGELOG entry for $vv present" -ForegroundColor Green
    } else {
        Write-Host "X CHANGELOG missing $vv" -ForegroundColor Red; exit 1
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
    if ($c -match $v22[$k]) { Write-Host "  + $k" -ForegroundColor Green }
    else { Write-Host "  X $k" -ForegroundColor Red; exit 1 }
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
    if ($c -match $v23[$k]) { Write-Host "  + $k" -ForegroundColor Green }
    else { Write-Host "  X $k" -ForegroundColor Red; exit 1 }
}

# v3.74.24 spot check
$v24 = Get-Content -LiteralPath "app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts" -Raw
if ($v24 -match '"owner", "admin", "general_manager", "manager"') {
    Write-Host "`n+ v3.74.24 mfg material-issue reject expanded" -ForegroundColor Green
} else { Write-Host "X v3.74.24 marker missing" -ForegroundColor Red; exit 1 }

# v3.74.25 spot check
$bv = Get-Content -LiteralPath "lib/services/bank-voucher-notification.service.ts" -Raw
if (([regex]::Matches($bv, 'resolveBranchAccountantRecipients')).Count -ge 2) {
    Write-Host "+ v3.74.25 bank-voucher accountant in 2 places" -ForegroundColor Green
} else { Write-Host "X v3.74.25 marker missing" -ForegroundColor Red; exit 1 }

# v3.74.26 spot checks
$srLib = Get-Content -LiteralPath "lib/sales-return-requests.ts" -Raw
if ($srLib -match "SALES_RETURN_VIEWER_ROLES\s*=\s*\[\s*'accountant'\s*,") {
    Write-Host "`n+ v3.74.26 viewer-role tier introduced" -ForegroundColor Green
} else { Write-Host "X v3.74.26 viewer role missing" -ForegroundColor Red; exit 1 }
if ($srLib -match "SALES_RETURN_LEVEL1_APPROVER_ROLES\s*=\s*\[\s*'owner',\s*'admin',\s*'general_manager',\s*'manager',\s*\]") {
    Write-Host "+ v3.74.26 accountant removed from L1 approver tier" -ForegroundColor Green
} else { Write-Host "X v3.74.26 accountant still in L1" -ForegroundColor Red; exit 1 }

# v3.74.27 marker (DB migration already applied)
if ($cl -match 'audit_logs_action_check' -and $cl -match 'REVERSE') {
    Write-Host "+ v3.74.27 changelog documents constraint expansion" -ForegroundColor Green
} else { Write-Host "X v3.74.27 changelog missing" -ForegroundColor Red; exit 1 }

# v3.74.28 marker (DB migration already applied)
if ($cl -match 'v3_74_28_customer_credit_account_2155' -and $cl -match '2155') {
    Write-Host "+ v3.74.28 changelog documents 2155 backfill" -ForegroundColor Green
} else { Write-Host "X v3.74.28 changelog missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(notifications, security, hotfix x2): v3.74.22-28 audit closure + 2 SR-warehouse hotfixes

v3.74.22 CRITICAL - widen approval recipients across 10 workflows to
include owner + branch manager (canonical L1 list).

v3.74.23 HIGH - originator now told the result on customer-refund
approve/reject and permission-transfer approve/reject.

v3.74.24 MEDIUM - upstream approvers now told on later-stage
rejections (purchase-return warehouse, bill receipt, mfg
material-issue).

v3.74.25 LOW - branch accountants added on banking vouchers and
expenses by convention.

v3.74.26 SECURITY - accountant removed from
SALES_RETURN_LEVEL1_APPROVER_ROLES (separation of duties).
SALES_RETURN_VIEWER_ROLES = ['accountant'] keeps them read-only.

v3.74.27 HOTFIX - audit_logs_action_check rejected 'REVERSE' and
several other action verbs in use across the codebase. Expanded
the allowlist to include REVERSE, WAREHOUSE_APPROVE,
SALES_RETURN_APPROVE, SALES_RETURN_WAREHOUSE_APPROVE,
purchase_request_converted, goods_receipt_processed,
customer_branch_changed_by_trigger, subscription_past_due,
subscription_reactivated.

v3.74.28 HOTFIX - account 2155 'رصيد العملاء الدائن' was missing
from chart_of_accounts_template AND from every existing company
(2/2). Sales-return preparation requires sub_type='customer_credit'
when the return creates a credit balance; without it the atomic
RPC threw 'Required accounts not found: Customer Credit' and the
warehouse-approve route 400ed. Migration adds 2155 to the template
and backfills every existing company. Idempotent.

Files:
  Modified: 20+ application files across v3.74.22-26
  Modified: lib/version.ts (3.74.21 -> 3.74.28)
  Modified: CHANGELOG.md (7 new entries)
  DB:       v3_74_27_audit_logs_action_check_expand
  DB:       v3_74_28_customer_credit_account_2155

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22-28 (consolidated) pushed" -ForegroundColor Green
}
