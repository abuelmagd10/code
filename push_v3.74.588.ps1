$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.587.ps1") { Remove-Item -LiteralPath "push_v3.74.587.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.588"') {
    Write-Host "+ 3.74.588" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
if ($nc -notmatch "kind" -or $nc -notmatch "v3\.74\.588") {
    Write-Host "X NotificationCenter kind handling missing" -ForegroundColor Red; exit 1
}
$gl = Get-Content -LiteralPath "lib/governance-layer.ts" -Raw
if ($gl -notmatch "NotificationKind|kind\?:") {
    Write-Host "X governance-layer kind type missing" -ForegroundColor Red; exit 1
}
$pan = Get-Content -LiteralPath "lib/services/payment-approval-notification.service.ts" -Raw
if ($pan -notmatch "p_kind|kind") {
    Write-Host "X payment approval service kind missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260709000588_v3_74_588_smart_notification_lifecycle.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ smart notification lifecycle markers present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
$files = @(
    "components/NotificationCenter.tsx",
    "lib/governance-layer.ts",
    "lib/sales-return-request-notifications.ts",
    "lib/services/payment-approval-notification.service.ts",
    "lib/services/purchase-order-notification.service.ts",
    "lib/services/purchase-return-notification.service.ts",
    "lib/services/bill-receipt-notification.service.ts",
    "lib/services/bank-voucher-notification.service.ts",
    "lib/services/write-off-notification.service.ts",
    "lib/services/inventory-transfer-notification.service.ts",
    "lib/services/sales-invoice-posting-command.service.ts",
    "app/expenses/[id]/page.tsx",
    "app/api/permissions/transfer/route.ts",
    "app/api/customers/refund-requests/route.ts",
    "app/api/customer-refund-requests/[id]/approve/route.ts",
    "app/api/vendor-payment-correction-requests/[id]/approve/route.ts",
    "app/api/payments/[id]/request-correction/route.ts",
    "app/api/payments/[id]/vendor-request-correction/route.ts",
    "app/api/payments/[id]/resubmit-after-reject/route.ts",
    "app/api/manufacturing/bom-versions/[id]/route.ts",
    "app/api/manufacturing/bom-versions/[id]/submit-approval/route.ts",
    "app/api/manufacturing/routing-versions/[id]/route.ts",
    "app/api/manufacturing/routing-versions/[id]/submit-approval/route.ts",
    "app/api/manufacturing/production-orders/[id]/route.ts",
    "app/api/manufacturing/production-orders/[id]/submit-approval/route.ts",
    "app/api/manufacturing/production-orders/[id]/request-material-issue/route.ts",
    "app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts",
    "app/api/manufacturing/material-issue-approvals/[id]/management-approve/route.ts",
    "supabase/migrations/20260709000588_v3_74_588_smart_notification_lifecycle.sql",
    "lib/version.ts",
    "push_v3.74.588.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.587.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_588.txt"
    $msgLines = @(
        'feat(notifications): v3.74.588 - smart lifecycle (action vs info)',
        '',
        'Owner design: two explicit notification kinds, classified at',
        'creation (never guessed from text):',
        '- action: someone must decide/confirm/execute. Auto-flips to',
        '  "actioned" for ALL recipients the moment the source document',
        '  reaches its terminal decision (DB triggers on purchase',
        '  returns, payments, customer refunds, vendor corrections,',
        '  sales return requests, discount approvals, invoice dispatch).',
        '- info: FYI announcements. Auto-archives per-user when they',
        '  open the reference (best-effort, never blocks navigation).',
        '',
        'Safety: moves only, never deletes; manual buttons unchanged;',
        'unknown/legacy rows default to info (no badge, no auto-archive);',
        'unread count already excludes actioned (verified).',
        '',
        'DB (migration 20260709000588, live via MCP): notifications.kind',
        '+ partial index, create_notification p_kind param (backward',
        'compatible), notif_complete_actions() + 7 decision triggers.',
        '',
        'App: ~25 request-stage creator sites now pass kind=action',
        '(payment approvals, PO/bill receipt, purchase/sales returns,',
        'bank vouchers, write-offs, inventory transfers 3-stage,',
        'refund execute legs, manufacturing submit/re-approval, expense',
        'approvals, permission transfers, invoice ready-to-ship).',
        'NotificationCenter: amber "action required" chip + info-only',
        'auto-archive on open-reference; kind enriched via secondary',
        'select because get_user_notifications RPC does not return it',
        '(future DB release can add it to drop the extra query).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.588 pushed - smart notification lifecycle live" -ForegroundColor Green
}
