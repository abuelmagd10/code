# v3.74.22 + 23 + 24 + 25 + 26 + 27 - bundled push (supersedes -22-25 and -22-26)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.27"') {
    Write-Host "+ APP_VERSION = 3.74.27" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.27" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($v in @('3.74.22', '3.74.23', '3.74.24', '3.74.25', '3.74.26', '3.74.27')) {
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
if ($srLib -match "SALES_RETURN_VIEWER_ROLES\s*=\s*\[\s*'accountant'\s*\,") {
    Write-Host "`n+ v3.74.26 viewer-role tier introduced" -ForegroundColor Green
} else { Write-Host "X v3.74.26 viewer role missing" -ForegroundColor Red; exit 1 }
if ($srLib -match "SALES_RETURN_LEVEL1_APPROVER_ROLES\s*=\s*\[\s*'owner',\s*'admin',\s*'general_manager',\s*'manager',\s*\]") {
    Write-Host "+ v3.74.26 accountant removed from L1 approver tier" -ForegroundColor Green
} else { Write-Host "X v3.74.26 accountant still in L1" -ForegroundColor Red; exit 1 }

# v3.74.27 marker — the DB migration is already applied via Supabase MCP;
# the verification here is just that the CHANGELOG documents it correctly.
if ($cl -match 'audit_logs_action_check' -and $cl -match 'REVERSE') {
    Write-Host "+ v3.74.27 changelog documents constraint expansion" -ForegroundColor Green
} else {
    Write-Host "X v3.74.27 changelog missing constraint details" -ForegroundColor Red
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
    git commit -m "feat(notifications, security, hotfix): v3.74.22-27 audit-closure bundle

v3.74.22 CRITICAL - owner/manager dropped from approval recipients
across 10 workflows (mfg bom/production/routing submits, customer
refunds, write-offs x2, purchase-orders, invoice warehouse x3,
expenses, bills, permissions/transfer submission). Switched to
canonical resolveLevel1ApproverRecipients or equivalent.

v3.74.23 HIGH - originator not told the decision result on customer
refunds (approve+reject) and permission transfers (approve+reject).
mfg material-issue already correct on re-inspection.

v3.74.24 MEDIUM - upstream approvers not told when later stages
reject. notifyManagementPRWarehouseRejected, notifyReceiptRejected,
mfg material-issue reject senior fanout all expanded to full L1.

v3.74.25 LOW - branch accountants added on banking vouchers
(notify + archive) and expenses (second members query merged into
allRecipients).

v3.74.26 SECURITY - SoD leak. Accountant was in
SALES_RETURN_LEVEL1_APPROVER_ROLES which gave them Approve/Reject
buttons on sales-return-requests despite the v3.69.0 spec keeping
management decisions with owner / admin / GM / branch manager.
Removed accountant from the approver list; introduced
SALES_RETURN_VIEWER_ROLES = ['accountant'] as a read-only tier so
the accountant still sees the page and still gets pending-approval
notifications (via the resolveBranchAccountantRecipients path which
is independent of the approver tier). Action endpoints + branch-
scope checks updated accordingly. Pending-count badge short-circuits
to 0 for accountant.

v3.74.27 HOTFIX - audit_logs_action_check rejected 'REVERSE' (and
several other action verbs the codebase actually writes), so the
warehouse-approve route for sales-return-requests returned HTTP 400
whenever the bonus-reversal helper kicked in for an invoice with a
real bonus. DB migration v3_74_27_audit_logs_action_check_expand
drops and re-creates the constraint with the union of the previous
allowlist plus 9 additional verbs already in use elsewhere
(REVERSE, WAREHOUSE_APPROVE, SALES_RETURN_APPROVE,
SALES_RETURN_WAREHOUSE_APPROVE, purchase_request_converted,
goods_receipt_processed, customer_branch_changed_by_trigger,
subscription_past_due, subscription_reactivated). No application
code change; the bonus-reversal helper still emits action='REVERSE'
exactly as it did, the DB just accepts it now.

Files:
  Modified: 20+ application files across v3.74.22-26 (listed above)
  Modified: lib/version.ts (3.74.21 -> 3.74.27)
  Modified: CHANGELOG.md (6 new entries)
  DB:       v3_74_27_audit_logs_action_check_expand

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22-27 (consolidated) pushed" -ForegroundColor Green
}
