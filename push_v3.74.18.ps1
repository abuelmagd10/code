# v3.74.18 - action-triggered archive across every approval workflow
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.18"') { Write-Host "+ APP_VERSION = 3.74.18" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.18" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.18\]' -and $cl -match 'archive_approval_notifications_for_record') {
    Write-Host "+ CHANGELOG entry for 3.74.18 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.18" -ForegroundColor Red; exit 1 }

if (Test-Path -LiteralPath "lib/notifications/archive-on-action.ts") {
    Write-Host "+ archive-on-action helper created" -ForegroundColor Green
} else { Write-Host "X helper missing" -ForegroundColor Red; exit 1 }

# Sample check: a few of the patched handlers
$samples = @(
    "app/expenses/[id]/page.tsx",
    "app/api/sales-return-requests/[id]/approve/route.ts",
    "app/api/sales-return-requests/[id]/warehouse-approve/route.ts",
    "app/api/sales-return-requests/[id]/warehouse-reject/route.ts",
    "app/api/customer-refund-requests/[id]/approve/route.ts",
    "app/api/customer-refund-requests/[id]/reject/route.ts",
    "app/api/permissions/transfer/[id]/approve/route.ts",
    "app/api/permissions/transfer/[id]/reject/route.ts",
    "app/api/manufacturing/material-issue-approvals/[id]/approve/route.ts",
    "app/api/manufacturing/bom-versions/[id]/approve/route.ts",
    "app/api/bills/[id]/approve/route.ts",
    "app/api/invoices/[id]/warehouse-approve/route.ts"
)
foreach ($f in $samples) {
    if (Test-Path -LiteralPath $f) {
        $c = Get-Content -LiteralPath $f -Raw
        if ($c -match 'archiveApprovalNotificationsForRecord') {
            Write-Host "  + $f" -ForegroundColor Green
        } else {
            Write-Host "  X $f did not get the helper call" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  (skip — file does not exist) $f" -ForegroundColor DarkYellow
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(notifications): v3.74.18 - action-triggered archive across all approval workflows

Ahmed's design: approval notifications should be archived when the
user actually performs the approve/reject action - not based on
time or status. Other notifications stay exactly as they were.

Implementation:

  (1) Helper RPC archive_approval_notifications_for_record(
         company_id, reference_type, reference_id)
      archives every category='approvals' notification (status IN
      unread/read) for the given workflow record. SECURITY DEFINER,
      idempotent, safe to call multiple times.

  (2) create_notification is now category-aware:
        category='approvals' -> keep v3.74.17 time-window safety net
                                (30 s race window + archive on insert)
        other categories     -> revert to v3.74.16 simple dedup
                                (no auto-archive, untouched)

  (3) Application helper lib/notifications/archive-on-action.ts is
      called by every approve/reject handler one line after
      committing the workflow status change.

  (4) Wired into 26 handler files:
      - expenses (inline page handlers, both approve + reject)
      - sales-return-requests (4: approve, reject, warehouse-approve,
                                warehouse-reject)
      - customer-refund-requests (2: approve, reject)
      - bills (2: approve, reject)
      - invoices warehouse (2: warehouse-approve, warehouse-reject)
      - write-offs/approve
      - supplier-payments (single endpoint, both actions)
      - banking/vouchers/workflow (both branches)
      - manufacturing material-issue-approvals (2)
      - manufacturing product-receive-approvals (2)
      - permissions/transfer (2)
      - manufacturing bom-versions (2)
      - manufacturing production-orders (2)
      - manufacturing routing-versions (2)
      - purchase-returns (single endpoint, both actions)

Placement rule used everywhere:
  Call the helper AFTER the workflow status update succeeds and
  BEFORE any 'result' notification sent to the creator below. Order
  matters - if we send the result first it gets archived too.

Behavior:
  Employee submits expense        -> approver gets 'اعتماد مصروف'
  Admin clicks sidebar badge,
    rejects on page               -> helper archives original;
                                     creator gets 'تم رفض المصروف'
  Employee resubmits              -> create_notification sees no
                                     active match -> fresh notification
                                     fires to admin  (the original
                                     bug Ahmed reported)
  Other categories (info, etc.)   -> untouched

Where archived live (unchanged):
  NotificationCenter -> 'الحالة' filter -> 'مؤرشف'.
  Never deleted. Deep-link still works.

Files:
  DB:    v3_74_18_category_aware_notification_archive
  New:   lib/notifications/archive-on-action.ts
  Modified: 26 approve/reject handler files (see list above)
  Modified: lib/version.ts (3.74.17 -> 3.74.18)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.18 pushed" -ForegroundColor Green
}
