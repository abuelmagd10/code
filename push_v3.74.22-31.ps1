# v3.74.22..31 - bundled push (supersedes -22-25/-26/-27/-28/-29/-30)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.31"') {
    Write-Host "+ APP_VERSION = 3.74.31" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.31" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($vv in @('3.74.22','3.74.23','3.74.24','3.74.25','3.74.26','3.74.27','3.74.28','3.74.29','3.74.30','3.74.31')) {
    if ($cl -match [regex]::Escape("[$vv]")) {
        Write-Host "+ CHANGELOG entry for $vv present" -ForegroundColor Green
    } else { Write-Host "X CHANGELOG missing $vv" -ForegroundColor Red; exit 1 }
}

# Application-code spot checks (22..26)
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
$v23 = @{
    "app/api/customer-refund-requests/[id]/approve/route.ts" = 'approved_requester'
    "app/api/customer-refund-requests/[id]/reject/route.ts"  = 'rejected_requester'
    "app/api/permissions/transfer/[id]/approve/route.ts"     = 'تم اعتماد طلب نقل الصلاحيات'
    "app/api/permissions/transfer/[id]/reject/route.ts"      = 'تم رفض طلب نقل الصلاحيات'
}
foreach ($k in $v23.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $v23[$k]) { Write-Host "  + $k" -ForegroundColor Green }
    else { Write-Host "  X $k" -ForegroundColor Red; exit 1 }
}
$v24 = Get-Content -LiteralPath "app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts" -Raw
if ($v24 -match '"owner", "admin", "general_manager", "manager"') {
    Write-Host "+ v3.74.24 marker" -ForegroundColor Green
} else { Write-Host "X v3.74.24 marker missing" -ForegroundColor Red; exit 1 }
$bv = Get-Content -LiteralPath "lib/services/bank-voucher-notification.service.ts" -Raw
if (([regex]::Matches($bv, 'resolveBranchAccountantRecipients')).Count -ge 2) {
    Write-Host "+ v3.74.25 marker" -ForegroundColor Green
} else { Write-Host "X v3.74.25 marker missing" -ForegroundColor Red; exit 1 }
$srLib = Get-Content -LiteralPath "lib/sales-return-requests.ts" -Raw
if ($srLib -match "SALES_RETURN_VIEWER_ROLES\s*=\s*\[\s*'accountant'\s*,") {
    Write-Host "+ v3.74.26 viewer-role tier" -ForegroundColor Green
} else { Write-Host "X v3.74.26 viewer role missing" -ForegroundColor Red; exit 1 }
if ($srLib -match "SALES_RETURN_LEVEL1_APPROVER_ROLES\s*=\s*\[\s*'owner',\s*'admin',\s*'general_manager',\s*'manager',\s*\]") {
    Write-Host "+ v3.74.26 accountant removed from L1" -ForegroundColor Green
} else { Write-Host "X v3.74.26 accountant still in L1" -ForegroundColor Red; exit 1 }

# DB-only releases — verify CHANGELOG markers
foreach ($entry in @(
    @{ v='3.74.27'; marker='audit_logs_action_check' },
    @{ v='3.74.28'; marker='v3_74_28_customer_credit_account_2155' },
    @{ v='3.74.29'; marker='v3_74_29_seed_company_accounts_use_template' },
    @{ v='3.74.30'; marker='v3_74_30_template_single_source_of_truth' },
    @{ v='3.74.31'; marker='v3_74_31_post_accounting_event_fix_v2' }
)) {
    if ($cl -match $entry.marker) {
        Write-Host "+ v$($entry.v) changelog references $($entry.marker)" -ForegroundColor Green
    } else { Write-Host "X v$($entry.v) changelog missing marker" -ForegroundColor Red; exit 1 }
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
    git commit -m "feat(notifications, security, hotfix x4, root cause): v3.74.22-31 bundle

v3.74.22 CRITICAL approval recipients (10 workflows).
v3.74.23 HIGH originator-notified on every decision.
v3.74.24 MEDIUM upstream-notified on later-stage rejections.
v3.74.25 LOW branch accountants on banking + expenses.
v3.74.26 SECURITY accountant removed from sales-return L1 tier.
v3.74.27 HOTFIX audit_logs_action_check expanded.
v3.74.28 HOTFIX account 2155 backfilled.
v3.74.29 ROOT CAUSE A trigger now reads from template.
v3.74.30 ROOT CAUSE B template is single source of truth (87 accounts).
v3.74.31 HOTFIX post_accounting_event RETURNING-INTO-array fix.
         The function declared v_payment_ids/v_return_ids/v_credit_ids
         as UUID[] but the INSERT...RETURNING id INTO statements were
         assigning scalars to those array variables, causing
         'malformed array literal' on the warehouse-approve path when
         the workflow actually inserted a customer credit (paid invoice
         + full return). Rewrote the three offending blocks to use a
         scratch UUID + array_append, matching the journal-entries
         block. Returned ID arrays now correctly contain every
         inserted row.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.22-31 (consolidated) pushed" -ForegroundColor Green
}
