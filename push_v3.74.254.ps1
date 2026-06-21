$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.253.ps1") { Remove-Item -LiteralPath "push_v3.74.253.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.254"') {
    Write-Host "+ 3.74.254" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$notify = Get-Content -LiteralPath "lib/refund-request-notifications.ts" -Raw
foreach ($c in @('notifyRefundRequestSubmitted','notifyRefundRequestApproved','notifyRefundRequestRejected','refund_request')) {
    if ($notify -notmatch [regex]::Escape($c)) { Write-Host "X notifications missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ notifications library wired (submitted / approved / rejected)" -ForegroundColor Green

$shipApi = Get-Content -LiteralPath "app/api/invoices/[id]/pre-shipment-refund/route.ts" -Raw
if ($shipApi -notmatch 'notifyRefundRequestSubmitted') { Write-Host "X invoice route missing notify" -ForegroundColor Red; exit 1 }
$rcptApi = Get-Content -LiteralPath "app/api/bills/[id]/pre-receipt-refund/route.ts" -Raw
if ($rcptApi -notmatch 'notifyRefundRequestSubmitted') { Write-Host "X bill route missing notify" -ForegroundColor Red; exit 1 }
$apprApi = Get-Content -LiteralPath "app/api/refund-requests/[id]/approve/route.ts" -Raw
if ($apprApi -notmatch 'notifyRefundRequestApproved')  { Write-Host "X approve route missing notify" -ForegroundColor Red; exit 1 }
$rejApi  = Get-Content -LiteralPath "app/api/refund-requests/[id]/reject/route.ts"  -Raw
if ($rejApi  -notmatch 'notifyRefundRequestRejected')  { Write-Host "X reject route missing notify"  -ForegroundColor Red; exit 1 }
Write-Host "+ all four routes call the right notifier" -ForegroundColor Green

if (-not (Test-Path "app/api/refund-approvals/pending-count/route.ts")) {
    Write-Host "X pending-count endpoint missing" -ForegroundColor Red; exit 1
}
Write-Host "+ pending-count endpoint present" -ForegroundColor Green

$side = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($side -notmatch 'pendingRefundApprovalsCount') { Write-Host "X sidebar missing badge derivation" -ForegroundColor Red; exit 1 }
if ($side -notmatch '"owner", "general_manager"\].includes\(myRole\)') {
    Write-Host "X sidebar link not role-gated" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar link gated to owner/GM with badge" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($inv -notmatch 'lastRejectedRefund')          { Write-Host "X invoice page missing rejection banner" -ForegroundColor Red; exit 1 }
$bill = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($bill -notmatch 'lastRejectedRefund')         { Write-Host "X bill page missing rejection banner"    -ForegroundColor Red; exit 1 }
Write-Host "+ invoice + bill pages surface the last rejection reason" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260620000254_v3_74_254_refund_badge_in_approval_badges_rpc.sql")) {
    Write-Host "X migration receipt missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration receipt present (RPC extended in DB)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_254.txt"
    $msgLines = @(
        "feat(refunds): v3.74.254 - notifications + sidebar badge + re-submit UX",
        "",
        "Closes the three gaps left in v3.74.253:",
        "",
        "1) Notifications (lib/refund-request-notifications.ts)",
        "   - notifyRefundRequestSubmitted: when a regular role submits,",
        "     notify owner + general_manager (priority high, approvals).",
        "   - notifyRefundRequestApproved:  on approve, notify requester.",
        "   - notifyRefundRequestRejected:  on reject, notify requester",
        "     with the rejection reason in the message body.",
        "   Wired into:",
        "     POST /api/invoices/[id]/pre-shipment-refund (submitted)",
        "     POST /api/bills/[id]/pre-receipt-refund     (submitted)",
        "     POST /api/refund-requests/[id]/approve       (approved)",
        "     POST /api/refund-requests/[id]/reject        (rejected)",
        "",
        "2) Sidebar",
        "   - get_user_approval_badges RPC extended with",
        "     refund_request_pending (owner / general_manager only).",
        "   - sidebar derives pendingRefundApprovalsCount from the new key.",
        "   - The /refund-approvals link is now role-gated via",
        "     ['owner','general_manager'].includes(myRole) - no leakage",
        "     to other roles - and renders the badge count.",
        "",
        "3) Re-submit UX after rejection",
        "   The unique partial index uq_refund_requests_active_per_source",
        "   only blocks pending_approval / approved_completed, so a",
        "   rejected row already allows a fresh submission. The missing",
        "   piece was telling the requester WHY they were rejected.",
        "   Invoice + bill pages now load the most-recent rejected",
        "   refund_request and show a red banner above the refund button:",
        "     'تم رفض طلب الاسترداد السابق. السبب: <reason>. يمكنك إعادة الإرسال.'",
        "",
        "Files",
        "  lib/refund-request-notifications.ts (new)",
        "  app/api/invoices/[id]/pre-shipment-refund/route.ts",
        "  app/api/bills/[id]/pre-receipt-refund/route.ts",
        "  app/api/refund-requests/[id]/approve/route.ts",
        "  app/api/refund-requests/[id]/reject/route.ts",
        "  app/api/refund-approvals/pending-count/route.ts (new)",
        "  app/invoices/[id]/page.tsx",
        "  app/bills/[id]/page.tsx",
        "  components/sidebar.tsx",
        "  supabase/migrations/20260620000254_v3_74_254_refund_badge_in_approval_badges_rpc.sql",
        "  lib/version.ts -> 3.74.254"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.254 pushed" -ForegroundColor Green
}
