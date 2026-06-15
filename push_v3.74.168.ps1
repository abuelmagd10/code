$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.167.ps1") { Remove-Item -LiteralPath "push_v3.74.167.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.168"') { Write-Host "+ 3.74.168" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity check: archiveNotifications now writes 'archived' not 'actioned'
$svc = Get-Content -LiteralPath "lib/services/purchase-return-notification.service.ts" -Raw
if ($svc -notmatch 'status: "archived"') {
    Write-Host "X service does not contain 'status: \"archived\"'" -ForegroundColor Red
    exit 1
}
# Also assert no stale 'actioned' UPDATE remains in the archive helper.
# (Other writes of status: 'actioned' may exist on other rows; we only
#  care that the one inside archiveNotifications is gone.)
$archiveBlock = ($svc -split 'private async archiveNotifications')[1]
if ($archiveBlock -and $archiveBlock -match 'status: "actioned"[\s\S]{0,200}actioned_at') {
    Write-Host "X archiveNotifications still writes status='actioned'" -ForegroundColor Red
    exit 1
}
Write-Host "+ archiveNotifications writes 'archived' (not 'actioned')" -ForegroundColor Green

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
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_168.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.168 - archiveNotifications writes 'archived' not 'actioned'",
        "",
        "Tester report (again): even after v3.74.167 the warehouse store_",
        "manager still got no notification on the second admin-approval",
        "cycle. Looking at the live row history for the failing return",
        "revealed v3.74.167 was a half-fix.",
        "",
        "What v3.74.167 did:",
        "  archiveNotifications selected rows by",
        "    .in('status', ['unread', 'read', 'actioned'])",
        "  so 'actioned' rows are now picked up alongside the others.",
        "",
        "What was still broken:",
        "  The UPDATE that followed wrote",
        "    status: 'actioned'",
        "  -- the same value the row already had after the warehouse user",
        "  rejected. So the archive step looked successful (rows are 'updated')",
        "  but the dedup state on those rows did NOT change.",
        "",
        "  create_notification's dedup branch for non-approvals categories",
        "  returns the existing notification id whenever it finds a row",
        "  with the same event_key whose status is NOT 'archived'. Our row",
        "  was 'actioned', not 'archived', so the function kept returning",
        "  the stale id and notifyWarehousePending kept silently no-op'ing.",
        "  The warehouse user inbox stayed empty.",
        "",
        "Fix:",
        "  lib/services/purchase-return-notification.service.ts",
        "    - archiveNotifications now writes status='archived' (not",
        "      'actioned'). actioned_at is reused as the timestamp of the",
        "      status change since notifications has no archived_at column.",
        "    - Comment above the UPDATE spells out the create_notification",
        "      contract so the next person editing this loop doesn't drop",
        "      back to 'actioned'.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.168.",
        "",
        "Manual remediation already applied to the affected return:",
        "  - The two stranded notifications from the second cycle on",
        "    PR-BILL-0002-... were flipped from 'actioned' back to 'unread'",
        "    so the warehouse user (bolok.foundation@) and the branch",
        "    accountant can see them in their default inbox view.",
        "",
        "How to verify:",
        "  - Take any purchase return through reject -> resubmit -> admin",
        "    approve. The warehouse user gets a NEW notification on each",
        "    admin approval cycle. The notifications row history for that",
        "    return should show the previous warehouse_pending rows with",
        "    status='archived' (not 'actioned') after each archive."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.168 pushed" -ForegroundColor Green
}
