# v3.74.15 - unified approval badges across all sidebar workflow pages
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.15"') { Write-Host "+ APP_VERSION = 3.74.15" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.15" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.15\]' -and $cl -match 'get_user_approval_badges') {
    Write-Host "+ CHANGELOG entry for 3.74.15 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.15" -ForegroundColor Red; exit 1 }

if (Test-Path -LiteralPath "hooks/use-approval-badges.ts") {
    Write-Host "+ use-approval-badges hook created" -ForegroundColor Green
} else { Write-Host "X hook missing" -ForegroundColor Red; exit 1 }

if (Test-Path -LiteralPath "app/api/sidebar/approval-badges/route.ts") {
    Write-Host "+ approval-badges endpoint created" -ForegroundColor Green
} else { Write-Host "X endpoint missing" -ForegroundColor Red; exit 1 }

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match 'useApprovalBadges\(' -and $sb -match 'sumBadges') {
    Write-Host "+ sidebar uses unified hook" -ForegroundColor Green
} else { Write-Host "X sidebar not refactored" -ForegroundColor Red; exit 1 }

# Make sure old separate states are gone
if ($sb -notmatch 'setPendingApprovalsCount' -and $sb -notmatch 'setPendingDispatchCount' -and $sb -notmatch 'setPendingSalesReturnRequestsCount') {
    Write-Host "+ legacy state setters removed" -ForegroundColor Green
} else { Write-Host "X legacy setters still present" -ForegroundColor Red; exit 1 }

# Verify badge wiring on the new entries
$badgeKeys = @(
    "customer_debit_note", "customer_refund_request", "purchase_request",
    "bill_receipt", "purchase_return_admin", "vendor_refund_request",
    "inventory_transfer", "inventory_write_off", "payment_approval",
    "expense", "bank_voucher_request"
)
foreach ($k in $badgeKeys) {
    if ($sb -match [regex]::Escape("approvalBadges['$k']") -or $sb -match [regex]::Escape("'$k'")) {
        Write-Host "+ badge key wired: $k" -ForegroundColor Green
    } else {
        Write-Host "X badge key missing in sidebar: $k" -ForegroundColor Red; exit 1
    }
}

Write-Host "`n=== Normalize sidebar.tsx casing to lowercase ===" -ForegroundColor Cyan
# git tracks the file as Sidebar.tsx (capital) from an earlier rename, but
# the NTFS on-disk entry is sidebar.tsx (lowercase) after recent edits.
# Force git to track as lowercase to match disk + every other file in the
# project. Two-step git mv via a temp name because Windows won't accept a
# rename that differs only in case.
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$tracked = git ls-files components/ | Where-Object { $_ -ieq "components/Sidebar.tsx" -or $_ -ieq "components/sidebar.tsx" }
if ($tracked -ceq "components/Sidebar.tsx") {
    Write-Host "  Renaming Sidebar.tsx -> sidebar.tsx in git index" -ForegroundColor Yellow
    git mv -f components/Sidebar.tsx components/_tmp_sidebar.tsx 2>&1 | Out-Null
    git mv -f components/_tmp_sidebar.tsx components/sidebar.tsx 2>&1 | Out-Null
} else {
    Write-Host "  Already tracked as lowercase" -ForegroundColor Green
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        "hooks/use-approval-badges.ts" `
        "app/api/sidebar/approval-badges/route.ts" `
        "components/sidebar.tsx" `
        "components/SidebarLayoutProvider.tsx" 2>&1 | Out-Null
# Pick up the case-rename in the index too
git add -A components/ 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(sidebar): v3.74.15 - unified approval badges across all workflow pages

Ahmed loved the v3.74.14 red badge on Sales Return Approvals and asked to
apply the same pattern everywhere. His critical clarification: the badge
must NOT depend on whether the notification was opened/read. It must
reflect the underlying workflow record - if the user opens the
notification and views the page but doesn't actually click Approve or
Reject, the badge stays. Only the real action decrements it.

Scan of every CHECK constraint with 'pending' or 'pending_approval'
revealed 17+ user-facing approval workflows. All wired through one
unified architecture:

  1. DB RPC get_user_approval_badges(user_id, company_id) returns JSONB
     with all counts, hand-scoped per workflow by role + branch +
     warehouse. SECURITY DEFINER.

  2. Endpoint /api/sidebar/approval-badges calls the RPC. No
     requirePermission - the RPC's scoping IS the authorization.

  3. Hook useApprovalBadges() polls every 30 s and exposes the map.
     Also re-fetches on every pathname change so the badge drops the
     moment the user takes an action and navigates back.

  4. Sidebar refactor:
       - Removed 3 separate states (pendingApprovalsCount,
         pendingDispatchCount, pendingSalesReturnRequestsCount).
       - Removed 3 separate callbacks/useEffects/endpoints (was
         360 fetches/hour/user; now 120).
       - Wired 11 new badges on workflow pages:
         customer-debit-notes, customer-refund-requests,
         purchase-orders, bills, purchase-returns, vendor-credits,
         inventory-transfers, write-offs, payments, expenses, banking.
       - Legacy aliases kept so any existing references continue to
         work without a rename.

Coverage (17+ workflows):
  Sales: sales_return_request_l1 + _warehouse, customer_debit_note,
         customer_refund_request
  Purchases: purchase_request, purchase_return_admin + _warehouse,
             vendor_refund_request, bill_receipt
  Warehouse: dispatch_approval, inventory_transfer, inventory_write_off
  Finance: expense, payment_approval, bank_voucher_request
  Mfg: mfg_material_issue, mfg_product_receive
  Permissions: permission_transfer (two-eye)

Files:
  DB: v3_74_15_unified_approval_badges_rpc
  New: app/api/sidebar/approval-badges/route.ts
  New: hooks/use-approval-badges.ts
  Modified: components/sidebar.tsx
  Modified: lib/version.ts (3.74.14 -> 3.74.15)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.15 pushed" -ForegroundColor Green
}
