# v3.74.23 - HIGH: originator notified of every decision in customer-refunds + permission transfers
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.23"') {
    Write-Host "+ APP_VERSION = 3.74.23" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.23" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.23\]' -and $cl -match 'originator now notified') {
    Write-Host "+ CHANGELOG entry for 3.74.23 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.23" -ForegroundColor Red; exit 1
}

$checks = @{
    "app/api/customer-refund-requests/[id]/approve/route.ts" = 'approved_requester'
    "app/api/customer-refund-requests/[id]/reject/route.ts"  = 'rejected_requester'
    "app/api/permissions/transfer/[id]/approve/route.ts"     = 'تم اعتماد طلب نقل الصلاحيات'
    "app/api/permissions/transfer/[id]/reject/route.ts"      = 'تم رفض طلب نقل الصلاحيات'
}
foreach ($k in $checks.Keys) {
    $c = Get-Content -LiteralPath $k -Raw
    if ($c -match $checks[$k]) {
        Write-Host "  + $k" -ForegroundColor Green
    } else {
        Write-Host "  X $k - pattern not found" -ForegroundColor Red
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
    git commit -m "feat(notifications): v3.74.23 - originator notified on every decision

The v3.74.21 audit catalogued four workflows where an approver's
decision (approve or reject) committed silently as far as the
originator was concerned: the next-stage actor or the audit log
got a notification, but the requester themselves were left
checking the status field manually. v3.74.21 fixed this for
sales-return-requests. This release fixes the remaining three
the audit flagged at HIGH priority.

A fourth candidate - manufacturing material-issue-approvals -
turned out to already be correct on re-inspection: both approve
(route.ts:691, userId: approval.requested_by) and reject
(route.ts:162, p_assigned_to_user: approval.requested_by) target
the requester directly. Skipped here.

Changes:

  customer-refund-requests approve
    Already notified branch accountant of the next stage. Added
    a second create_notification RPC to the originator with
    title 'تم اعتماد طلب الاسترداد'. Self-approval guard skips
    if requested_by === user.id. Severity info, category
    approvals, event_action approved_requester.

  customer-refund-requests reject
    Previously rejected silently. Added recipient-resolver import
    plus a single create_notification call to the requester with
    title 'تم رفض طلب الاسترداد' and the rejection reason in the
    message. Severity error, category approvals, event_action
    rejected_requester.

  permissions/transfer approve
    Two-eye routes had no notification calls at all. Added a
    direct notifications INSERT (route doesn't use the resolver
    service) targeting transfer.transferred_by with title 'تم
    اعتماد طلب نقل الصلاحيات' and the count of records actually
    transferred.

  permissions/transfer reject
    Same pattern - direct notifications INSERT to the submitter
    with the rejection reason and severity error.

Why direct INSERT for permission-transfer: the two refund routes
use the create_notification RPC (which applies v3.74.18
category-aware dedup). The transfer routes use a direct INSERT
because they don't import the resolver at all and adding it
solely for an originator notification would have meant a much
larger refactor. The direct INSERT bypasses time-window dedup,
but each event_key is unique-per-decision so dedup isn't needed.

Files:
  Modified: app/api/customer-refund-requests/[id]/approve/route.ts
  Modified: app/api/customer-refund-requests/[id]/reject/route.ts
  Modified: app/api/permissions/transfer/[id]/approve/route.ts
  Modified: app/api/permissions/transfer/[id]/reject/route.ts
  Modified: lib/version.ts (3.74.22 -> 3.74.23)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.23 pushed" -ForegroundColor Green
}
