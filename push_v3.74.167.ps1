$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.166.ps1") { Remove-Item -LiteralPath "push_v3.74.166.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.167"') { Write-Host "+ 3.74.167" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity check: archive list now includes "actioned"
$svc = Get-Content -LiteralPath "lib/services/purchase-return-notification.service.ts" -Raw
if ($svc -notmatch '"unread", "read", "actioned"') {
    Write-Host "X archive list does not include 'actioned'" -ForegroundColor Red
    exit 1
}
Write-Host "+ archive list includes 'actioned'" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_167.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.167 - warehouse notif missing after second approval cycle",
        "",
        "Tester report: owner rejects -> creator edits and resubmits ->",
        "owner approves the resubmission -> creator's 'approved' notification",
        "arrives fine -> but the warehouse store_manager gets NOTHING about",
        "the new goods receipt approval. End of workflow stalls.",
        "",
        "Root cause - traced via the notifications row history for the",
        "failing return (PR-BILL-0002-...) in DB:",
        "",
        "  - First admin approval (08:34): warehouse_pending notification",
        "    inserted normally, status='unread'.",
        "  - Warehouse rejects: status flips to 'actioned' (the inbox UI",
        "    marks it as the user took the workflow action).",
        "  - Second admin approval (09:11): notifyWarehousePending runs",
        "    again. It first calls archiveWarehousePendingNotifications,",
        "    which selects rows for archival by",
        "       .in('status', ['unread', 'read'])",
        "    -- missing 'actioned'. The existing row is NOT archived.",
        "  - Then create_notification runs with category='inventory'. For",
        "    non-approvals categories, create_notification's dedup branch",
        "    returns the OLD id when it finds any row with the same",
        "    event_key and status != 'archived'. Our row was 'actioned',",
        "    not 'archived', so the function silently returned the old id.",
        "    No new notification was inserted.",
        "  - Result: warehouse user inbox shows nothing new and the",
        "    workflow is stuck.",
        "",
        "Fix:",
        "  lib/services/purchase-return-notification.service.ts",
        "    - archiveNotifications() now treats 'actioned' as archivable",
        "      alongside 'unread' and 'read'. The next call to",
        "      create_notification therefore sees no live conflict and",
        "      inserts the fresh warehouse_pending row.",
        "    - The comment above the line explains the constraint so the",
        "      next person reordering status semantics doesn't drop",
        "      'actioned' again.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.167.",
        "",
        "Manual remediation already applied to the affected return:",
        "  - SQL UPDATE archived the orphaned 'actioned' row for the",
        "    warehouse user on the failing PR.",
        "  - SQL SELECT create_notification(...) inserted the missing",
        "    warehouse_pending notification (event_key suffix ':resend'",
        "    to avoid clashing with the broken historical row).",
        "  - Warehouse user can now see the request and act on it.",
        "",
        "How to verify going forward:",
        "  - Take any purchase return through reject -> resubmit -> admin",
        "    approve. The warehouse user gets a NEW notification on each",
        "    admin approval cycle, not just the first one."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.167 pushed" -ForegroundColor Green
}
