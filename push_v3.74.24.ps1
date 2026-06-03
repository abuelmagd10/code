# v3.74.24 - MEDIUM: widen upstream notifications on later-stage rejections
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.24"') {
    Write-Host "+ APP_VERSION = 3.74.24" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.24" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.24\]' -and $cl -match 'widen upstream notifications') {
    Write-Host "+ CHANGELOG entry for 3.74.24 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.24" -ForegroundColor Red; exit 1
}

$checks = @{
    "lib/notification-helpers.ts"                                                   = "'owner', 'admin', 'general_manager', 'manager'"
    "lib/services/bill-receipt-notification.service.ts"                             = '"owner", "admin", "general_manager", "manager"'
    "app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts"           = '"owner", "admin", "general_manager", "manager"'
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
    git commit -m "feat(notifications): v3.74.24 - widen upstream notifications on later-stage rejections

When a multi-stage workflow goes stage-1-approve then stage-2-reject,
the stage-1 approvers need to know their decision was undone so they
can stop tracking the request. Previous code had partial coverage and
usually missed owner + branch manager - same root cause as v3.74.22
(hardcoded subsets of the senior tier), narrower trigger.

Three workflows updated:

  notifyManagementPRWarehouseRejected (lib/notification-helpers.ts):
    Fires when warehouse rejects a PR that management already approved.
    Fallback role-list was the bug.
    OLD: ['admin', 'general_manager']
    NEW: ['owner', 'admin', 'general_manager', 'manager']
    Inline comment claiming 'owner sees admin notifications via RPC
    fan-out' was untrue and is rewritten.

  notifyReceiptRejected (lib/services/bill-receipt-notification.service.ts):
    Fires when warehouse rejects receipt on a bill management may have
    pre-approved.
    OLD: ['owner', 'general_manager']
    NEW: ['owner', 'admin', 'general_manager', 'manager']

  Material-issue rejection senior fanout (app/api/.../reject/route.ts):
    Inline 'for (const seniorRole of [\"general_manager\"])' loop with
    comment claiming owner/admin auto-receive notifications. Comment
    was untrue - canonical v3.74.20 owner-drop bug pattern.
    Loop now iterates ['owner', 'admin', 'general_manager', 'manager'].

Closed as PASS on re-inspection (no change needed):
 - purchase-orders rejection: single-stage; originator already notified
 - mfg bom/production/routing rejection: single-stage; same as above
 - bills admin rejection: admin IS the upstream; creator already notified
   by notifyBillAdminRejected (line 295)

Three of the five audit candidates resolved to 'no upstream approvers
to notify' because the workflow was actually single-stage. For those
the originator-notification rule (HIGH / v3.74.23) is the correct
coverage.

Files:
  Modified: lib/notification-helpers.ts
  Modified: lib/services/bill-receipt-notification.service.ts
  Modified: app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts
  Modified: lib/version.ts (3.74.23 -> 3.74.24)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.24 pushed" -ForegroundColor Green
}
