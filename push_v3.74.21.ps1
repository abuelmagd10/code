# v3.74.21 - Sales returns: originator notified on L1 approval + realtime page refresh
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.21"') {
    Write-Host "+ APP_VERSION = 3.74.21" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.21" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.21\]' -and $cl -match 'notifySalesReturnRequesterLevel1Approved') {
    Write-Host "+ CHANGELOG entry for 3.74.21 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.21" -ForegroundColor Red; exit 1
}

# Spot-check the three touchpoints
$helper = Get-Content -LiteralPath "lib/sales-return-request-notifications.ts" -Raw
if ($helper -match 'notifySalesReturnRequesterLevel1Approved') {
    Write-Host "+ helper notifySalesReturnRequesterLevel1Approved exported" -ForegroundColor Green
} else { Write-Host "X helper missing" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/approve/route.ts" -Raw
if ($route -match 'notifySalesReturnRequesterLevel1Approved') {
    Write-Host "+ approve route calls the new helper" -ForegroundColor Green
} else { Write-Host "X approve route does not call helper" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/sales-return-requests/page.tsx" -Raw
if ($page -match 'sales_return_requests:\$\{companyId\}') {
    Write-Host "+ page subscribes to Realtime channel" -ForegroundColor Green
} else { Write-Host "X realtime subscription missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(sales-returns): v3.74.21 - notify originator on L1 approval + realtime page

Two gaps Ahmed reported after testing v3.74.20:

  (1) Asymmetric originator feedback.
      When management rejected a return the originator was told;
      when management approved it the originator was told nothing
      and the workflow silently moved to the warehouse stage.
      Canonical project rule: every decision (positive or negative)
      reaches the originator.

  (2) Stale listing page.
      /sales-return-requests only refetched on filter change. An
      approval from another tab, a phone rejection, or a resubmission
      from the invoice page left the open page showing old data.

Changes:

  - New helper notifySalesReturnRequesterLevel1Approved in
    lib/sales-return-request-notifications.ts. Mirrors the existing
    rejected helper for the positive case. Single recipient
    (requested_by). category=approvals, severity=info,
    event_action=level_1_approved_requester.

  - app/api/sales-return-requests/[id]/approve/route.ts now calls
    the new helper after notifySalesReturnWarehouseRequested.
    Self-approval guard: skip if request.requested_by === user.id.

  - app/sales-return-requests/page.tsx subscribes to a Supabase
    Realtime channel sales_return_requests:<companyId> with a
    Postgres-level filter company_id=eq.<companyId>. On any change
    it re-runs loadData(). Channel torn down on unmount.

Why loadData() instead of merging the realtime row: the realtime
payload is the raw sales_return_requests row without the JOINed
invoices and customers data the page renders. Cheapest correct
path is to re-fetch through the same API the initial load uses.

The broader audit of all 17 approval workflows is complete; the
remaining gaps (other workflows missing similar coverage) will be
addressed in v3.74.22+ batched by severity.

Files:
  Modified: lib/sales-return-request-notifications.ts
  Modified: app/api/sales-return-requests/[id]/approve/route.ts
  Modified: app/sales-return-requests/page.tsx
  Modified: lib/version.ts (3.74.20 -> 3.74.21)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.21 pushed" -ForegroundColor Green
}
