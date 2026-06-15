$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.168.ps1") { Remove-Item -LiteralPath "push_v3.74.168.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.169"') { Write-Host "+ 3.74.169" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/purchase-return-notification.service.ts" -Raw
if ($svc -match '"admin", "general_manager"') {
    Write-Host "X service still uses [admin, general_manager]" -ForegroundColor Red
    exit 1
}
Write-Host "+ purchase-return notif uses single admin role" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_169.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.169 - duplicate approval-request notification for upper roles",
        "",
        "Tester report: on resubmission the owner inbox shows TWO identical",
        "'تمت إعادة إرسال مرتجع مشتريات للاعتماد' notifications, same time,",
        "same content.",
        "",
        "Root cause:",
        "  PurchaseReturnNotificationService.notifyApprovalRequested called",
        "    resolveRoleRecipients(['admin', 'general_manager'], ...)",
        "  which writes TWO notifications to the DB - one with",
        "  assigned_to_role='admin', one with assigned_to_role='general_manager'.",
        "  components/NotificationCenter.tsx already lets every upper role",
        "  (owner / admin / general_manager) read each other's notifications,",
        "  so any single upper-role user sees BOTH rows in their inbox.",
        "  The owner reads the 'admin' row AND the 'general_manager' row.",
        "  Same problem on notifyWarehouseRejected (management notification)",
        "  and archiveApprovalRequestNotifications.",
        "",
        "Fix:",
        "  lib/services/purchase-return-notification.service.ts",
        "    - All three call sites that previously passed",
        "      ['admin', 'general_manager'] now pass ['admin'] only.",
        "    - Comment inline explains the constraint so the next person",
        "      adding a role doesn't reintroduce the duplicate.",
        "    - Upper-role coverage is preserved by the UI filter:",
        "        isUpperRole(userRole) && isUpperRole(notification.assigned_to_role)",
        "      so owner and general_manager still see the single 'admin'",
        "      row in their inbox.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.169.",
        "",
        "Manual remediation already applied to the affected return:",
        "  - The orphan 'general_manager' duplicates on the failing PR",
        "    (resubmit + warehouse-rejection management) were archived",
        "    via SQL. The owner inbox now shows one row per workflow event.",
        "",
        "How to verify:",
        "  - Push a purchase return through reject -> resubmit. The owner",
        "    inbox shows ONE 'تمت إعادة إرسال' row, not two.",
        "  - Push a return to warehouse rejection. The owner inbox shows",
        "    ONE 'رفض المخزن' row.",
        "  - A general_manager who is NOT the owner still sees the same",
        "    single row in their inbox (UI grants upper-role cross-visibility)."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.169 pushed" -ForegroundColor Green
}
