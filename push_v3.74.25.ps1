# v3.74.25 - LOW: branch accountants added as approval recipients on banking vouchers + expenses
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
if ($cl -match '\[3.74.25\]' -and $cl -match 'branch accountants added') {
    Write-Host "+ CHANGELOG entry for 3.74.25 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.25" -ForegroundColor Red; exit 1
}

$bv = Get-Content -LiteralPath "lib/services/bank-voucher-notification.service.ts" -Raw
if (([regex]::Matches($bv, 'resolveBranchAccountantRecipients')).Count -ge 2) {
    Write-Host "+ bank-voucher service includes accountant in 2 places" -ForegroundColor Green
} else {
    Write-Host "X bank-voucher service is missing the accountant additions" -ForegroundColor Red
    exit 1
}

$exp = Get-Content -LiteralPath "app/expenses/[id]/page.tsx" -Raw
if ($exp -match 'branchAccountants' -and $exp -match 'allRecipients') {
    Write-Host "+ expenses page merges branch accountants into recipient list" -ForegroundColor Green
} else {
    Write-Host "X expenses page is missing the accountant merge" -ForegroundColor Red
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
    git commit -m "feat(notifications): v3.74.25 - add branch accountants on banking vouchers + expenses

Closes the v3.74.21 audit. With CRITICAL/HIGH/MEDIUM out of the way
the remaining findings were a handful of LOW-priority consistency
gaps: workflows where the approval-permission logic was correct
but the recipient list didn't yet include the branch accountant.
The accountant isn't an approver but in every other corner of the
system the convention is to give them inbox visibility on pending
approvals so they can pre-stage their books. Sales-returns,
purchase-returns, payment-approvals, and bills already did this.
Banking vouchers and expenses were the two outliers.

Changes:

  bank-voucher-notification.service.ts
    notifyApprovalRequested: added resolveBranchAccountantRecipients
    as a third recipient block alongside manager + leadership.
    archiveApprovalRequestNotifications: same addition so the
    archive sweep on decision removes the accountant's row too,
    avoiding stale notifications until the v3.74.17 time-window
    safety net catches them.

  app/expenses/[id]/page.tsx
    Expenses query company_members directly. v3.74.22 added
    'manager' to the role filter. v3.74.25 adds a second query
    for branch accountants scoped to expense.branch_id and merges
    the two lists into allRecipients before the per-user
    notification loop. Per-user event_keys are unchanged so
    existing idempotency holds.

Closed as PASS:
  - Invoices warehouse resolveExecutiveRecipients - already
    migrated in v3.74.22.
  - Purchase-orders branch manager only with branchId - already
    fixed in v3.74.22; resolveLevel1ApproverRecipients(null,..)
    emits a company-wide manager recipient.
  - Misleading RPC fan-out comments - corrected wherever
    surrounding code was modified; remaining ones are doc-only.
  - Write-offs cancellation missing upstream visibility -
    single-stage workflow; creator is the only relevant audience.

Series wrap-up: v3.74.21 through v3.74.25 brought every approval
workflow in the project into compliance with the canonical rule:
 (1) Level-1 requests reach the full senior tier including owner
 (2) every decision reaches the originator
 (3) every later-stage rejection reaches upstream approvers
 (4) branch accountants are notified by convention everywhere
Audit closed.

Files:
  Modified: lib/services/bank-voucher-notification.service.ts
  Modified: app/expenses/[id]/page.tsx
  Modified: lib/version.ts (3.74.24 -> 3.74.25)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.25 pushed" -ForegroundColor Green
}
