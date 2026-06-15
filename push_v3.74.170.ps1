$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.169.ps1") { Remove-Item -LiteralPath "push_v3.74.169.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.170"') { Write-Host "+ 3.74.170" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/purchase-return-notification.service.ts" -Raw
if ($svc -match 'resolveLevel1ApproverRecipients\(null, null, null\)') {
    Write-Host "X notifyConfirmed still uses resolveLevel1ApproverRecipients" -ForegroundColor Red
    exit 1
}
if ($svc -notmatch 'resolveLeadershipVisibilityRecipients') {
    Write-Host "X notifyConfirmed does not use leadership-visibility recipients" -ForegroundColor Red
    exit 1
}
Write-Host "+ notifyConfirmed uses leadership-visibility + branch manager" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_170.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.170 - notifyConfirmed triplicate for owner",
        "",
        "Tester report: after warehouse confirmed the resubmitted return,",
        "the owner inbox showed THREE identical 'تم اعتماد مرتجع مشتريات",
        "من المخزن' notifications.",
        "",
        "Root cause:",
        "  notifyConfirmed called resolveLevel1ApproverRecipients which",
        "  emits FOUR role rows: owner / admin / general_manager / manager.",
        "  shouldShowNotification grants every upper role cross-visibility",
        "  into each other's notifications, so the owner saw the owner row",
        "  + the admin row + the general_manager row = three identical",
        "  notifications. The manager row stays branch-scoped and only",
        "  the branch manager sees that one (correct behaviour).",
        "  Same dedup pattern as v3.74.169, different recipient helper.",
        "",
        "Fix:",
        "  lib/services/purchase-return-notification.service.ts",
        "    - notifyConfirmed now passes:",
        "        [",
        "          ...resolveLeadershipVisibilityRecipients(null, null, null),",
        "          resolveBranchRoleRecipient('manager', branchId, null, costCenterId),",
        "        ]",
        "      The leadership helper emits a single 'admin' row that the",
        "      UI surfaces to owner + admin + general_manager. The branch",
        "      manager row stays branch-scoped as before.",
        "    - Comment explains why we don't use the canonical Level-1",
        "      helper so the next person doesn't regress.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.170.",
        "",
        "Manual remediation already applied to the affected return:",
        "  - The 'owner' and 'general_manager' duplicate rows on PR-BILL-0002",
        "    were archived. The owner inbox now shows one row for the",
        "    confirmation event.",
        "",
        "Out of scope for this commit (filed as v3.74.171):",
        "  - AP balance drift of 3 on BILL-0002: the bill was fully paid",
        "    when the return ran, so Cr 1180 / vendor_credit row should",
        "    be created instead of Cr 2110 directly. Currently outstanding",
        "    on the bill goes negative (-3).",
        "  - GL 1140 vs FIFO drift of -8: production_receipt for product",
        "    398f added a 5 EGP FIFO lot with no offsetting GL entry, and",
        "    the purchase return decreased GL 1140 by 3 without writing",
        "    a reverse fifo_lot_consumption (or reducing the lot's",
        "    remaining_quantity)."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.170 pushed" -ForegroundColor Green
}
