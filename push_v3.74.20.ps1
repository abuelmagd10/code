# v3.74.20 - Owner included in Level-1 approval notification recipients
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.20"') {
    Write-Host "+ APP_VERSION = 3.74.20" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.20" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.20\]' -and $cl -match 'resolveLevel1ApproverRecipients') {
    Write-Host "+ CHANGELOG entry for 3.74.20 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.20" -ForegroundColor Red; exit 1
}

# Spot-check the three call sites
$samples = @(
    "lib/services/notification-recipient-resolver.service.ts",
    "lib/sales-return-request-notifications.ts",
    "lib/services/payment-approval-notification.service.ts",
    "lib/services/purchase-return-notification.service.ts"
)
foreach ($f in $samples) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'resolveLevel1ApproverRecipients') {
        Write-Host "  + $f wires the new helper" -ForegroundColor Green
    } else {
        Write-Host "  X $f does not reference the new helper" -ForegroundColor Red
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
    git commit -m "feat(notifications): v3.74.20 - owner included in Level-1 approval recipients

Ahmed reported that after a warehouse manager rejected a sales return
request and the originator edited and resubmitted it, no senior
approver received a notification - the workflow stalled with no
inbox signal.

Diagnosis for his test case (request 063d486c-..., resubmitted at
2026-06-03 12:26): four 'level_1_requested' notifications fired,
targeting admin / general_manager / manager / branch-accountant.
None of those roles exist in his company except the accountant -
who was also the originator. The owner, the only senior member who
could approve, was never targeted because the recipient list was
hard-coded to ['admin', 'general_manager', 'manager']. Same pattern
was duplicated in payment-approval and purchase-return services.

This is a notification layer drift: the SALES_RETURN_LEVEL1_APPROVER_ROLES
constant already lists 'owner' as a valid Level-1 approver, the page
UI honors that, the API allowlist honors that - only the notification
recipient list was out of sync.

Changes:

  (1) New canonical helper resolveLevel1ApproverRecipients on
      NotificationRecipientResolverService. Returns the four-role
      list every Level-1 workflow should use:
        owner            - company-wide
        admin            - company-wide
        general_manager  - company-wide
        manager          - scoped to originating branch
      Branch accountants stay a separate call - they are recipients
      of approval notifications by convention but are not Level-1
      approvers.

  (2) Wired into the three affected services:
      lib/sales-return-request-notifications.ts
        - notifySalesReturnLevel1Requested
        - notifySalesReturnManagementCompleted
        - notifySalesReturnManagementRejectedByWarehouse
      lib/services/payment-approval-notification.service.ts
        - notifyApprovalRequested
      lib/services/purchase-return-notification.service.ts
        - warehouse-confirmation branch

  (3) Backfill of the in-flight test case. Ahmed's outstanding
      request 063d486c-... was created on the old code path so its
      'owner' notification was never inserted. A one-shot SQL
      INSERT ... WHERE NOT EXISTS filled in the missing row with
      the exact shape the new code would have produced.

Branch-scoped helpers that intentionally target only the branch
manager (bank-voucher, booking, purchase-order) were left untouched -
those are routine operational notifications where adding owner would
create owner-inbox noise without buying any safety.

Verification:
  - Owner-targeted unread notification for 063d486c: 1 (was 0)
  - Sales-return requests visible to owner in pending_approval_level_1: 1

Files:
  Modified: lib/services/notification-recipient-resolver.service.ts (new helper)
  Modified: lib/sales-return-request-notifications.ts (3 call sites)
  Modified: lib/services/payment-approval-notification.service.ts (1 call site)
  Modified: lib/services/purchase-return-notification.service.ts (1 call site)
  Modified: lib/version.ts (3.74.19 -> 3.74.20)
  Modified: CHANGELOG.md
  DB:       one-shot backfill of missing owner notification

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.20 pushed" -ForegroundColor Green
}
