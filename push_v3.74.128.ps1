$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.127.ps1") { Remove-Item -LiteralPath "push_v3.74.127.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.128"') { Write-Host "+ 3.74.128" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(payments): v3.74.128 - sidebar entry + unified styling for vendor payment correction page

User feedback on v3.74.127:
  1) The new page wasn't reachable from the sidebar — it was only
     accessible through the deep link in the post-request notification.
  2) The page used raw HTML tables and bare cards instead of the
     project-wide DataTable / FilterContainer / LoadingState /
     EmptyState / ERPPageHeader-inside-white-card pattern that every
     other workflow page uses. It looked foreign next to its
     customer-side sibling.

Both gaps are closed here. No DB schema changes; this is UI alignment.

Sidebar (components/sidebar.tsx):
  - New entry under Purchases group: 'طلبات تصحيح مدفوعات الموردين'
    / 'Vendor Payment Corrections', RefreshCw icon, mirrored
    placement to its customer twin's spot under Sales.
  - Badge bound to approvalBadges['vendor_payment_correction_request']
    so the count flows in once the badges RPC is updated to surface
    the new approval queue (current default of 0 keeps the badge
    hidden if not yet present — no breakage).
  - hrefToResource() map now includes the new page so the existing
    allowed_pages gate hides the entry from roles without access.

DB governance migration:
  v3_74_128_vendor_payment_correction_permissions
  - Grants 'accountant' the same read+write+access on
    vendor_payment_correction_requests as they have on
    customer_refund_requests. Owner + GM keep the implicit
    full-access path elsewhere.

Page rewrite (app/vendor-payment-correction-requests/page.tsx):
  - Same shell as /customer-refund-requests: gradient bg + md:mr-64
    main + CompanyHeader + ERPPageHeader-inside-white-rounded-card
  - Three stats cards (Pending / Approved / Executed) clickable
    to switch filterStatus, matching the customer page exactly
  - Main card with Status select + FilterContainer search + DataTable
    + LoadingState + EmptyState; same colour scheme and spacing
  - useAutoRefresh hook for tab-focus refresh + postgres_changes
    Realtime channel on the table
  - Approve / Reject dialog with the same warning panels and
    color-coded confirm button as the customer version
  - Execute dialog renamed to a confirmation panel (no inputs —
    the proposed_changes were captured at request time on /payments)
  - SoD message rendered inline when approver == current user
  - URL ?status= still respected; non-board members still only see
    their own rows.

CommandPalette / page-guides will pick up the new key automatically
on next refresh of the cached resource list (no code change needed
on this release; the key 'vendor_payment_correction_requests' is now
present in hrefToResource so subsequent palette/breadcrumb fetches
will include it)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.128 pushed" -ForegroundColor Green
}
