$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.176.ps1") { Remove-Item -LiteralPath "push_v3.74.176.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.177"') { Write-Host "+ 3.74.177" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$helper = Get-Content -LiteralPath "lib/notification-helpers.ts" -Raw
if ($helper -match "const roles = \['owner', 'admin', 'general_manager'\]") {
    Write-Host "X vendor refund notif still targets three roles" -ForegroundColor Red
    exit 1
}
if ($helper -notmatch "const roles = \['admin'\]") {
    Write-Host "X vendor refund notif does not target only admin" -ForegroundColor Red
    exit 1
}
Write-Host "+ vendor refund notif targets admin only" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($page -notmatch "hasPendingRefund") {
    Write-Host "X suppliers page does not gate refund button on pending request" -ForegroundColor Red
    exit 1
}
Write-Host "+ suppliers page hides refund button when request is pending" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_177.txt"
    $msgLines = @(
        "fix(suppliers): v3.74.177 - vendor refund button + duplicate notification",
        "",
        "Tester report on the supplier-side cash refund flow (محمد الصاوى):",
        "  1. Branch accountant clicked 'استرداد نقدى' and submitted the",
        "     form successfully, but the button stayed visible afterwards.",
        "     Same supplier could have a second request raised against the",
        "     same open vendor_credit.",
        "  2. Owner inbox received TWO identical",
        "     'طلب استرداد سلفة مورد — محمد الصاوى' notifications.",
        "  3. General manager expected to receive it too - DB confirms it",
        "     did, but the row is redundant given the UI rule.",
        "",
        "Root cause (1): the button was gated only on",
        "    balance.debitCredits > 0",
        "  which stays true until the workflow executes and applies the",
        "  vendor_credit. refundRequests state was already loaded but the",
        "  guard never consulted it.",
        "",
        "Root cause (2 + 3): lib/notification-helpers.ts'",
        "  notifyVendorRefundRequestCreated wrote one row per role in",
        "  ['owner', 'admin', 'general_manager']. NotificationCenter's",
        "  shouldShowNotification grants every upper role cross-visibility,",
        "  so the owner inbox surfaced the owner row + the admin row + the",
        "  general_manager row = three rows for one event. The UI tester",
        "  saw two of them clipped to the screen. Same pattern fix as",
        "  v3.74.169 (purchase return) and v3.74.170 (warehouse confirm).",
        "",
        "Fix:",
        "",
        "  lib/notification-helpers.ts",
        "    - notifyVendorRefundRequestCreated now targets ['admin'] only.",
        "      Owner and general_manager still see the single 'admin' row",
        "      because the UI filter lets upper roles read each other's",
        "      notifications. Comment links back to v3.74.169 / v3.74.170.",
        "",
        "  app/suppliers/page.tsx",
        "    - Wraps the 'Cash Refund' button in an IIFE that first checks",
        "      refundRequests for a pending_approval row matching the",
        "      current supplier_id. When present, a disabled amber pill",
        "      'استرداد قَيد الاعتماد' renders instead - no second submit",
        "      and a visible cue that the request is in flight.",
        "    - onReceiptComplete now refreshes loadRefundRequests too so",
        "      the new pending row appears immediately after submit",
        "      (previously only loadSuppliers ran).",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.177.",
        "",
        "Manual remediation already applied:",
        "  - The orphan 'owner' and 'general_manager' duplicate rows on",
        "    the failing request (319f20bc-...) were archived. Owner inbox",
        "    now shows one row for the event.",
        "",
        "How to verify going forward:",
        "  - As branch accountant on a supplier with open vendor_credit:",
        "      Click 'استرداد نقدى', submit. The button row immediately",
        "      changes to 'استرداد قَيد الاعتماد' and refuses further",
        "      submits.",
        "  - Owner inbox shows ONE 'طلب استرداد سلفة مورد' notification,",
        "    not two or three.",
        "  - A general_manager who is not the owner sees the same single",
        "    notification."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.177 pushed" -ForegroundColor Green
}
