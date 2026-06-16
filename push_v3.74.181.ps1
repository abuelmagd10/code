$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.180.ps1") { Remove-Item -LiteralPath "push_v3.74.180.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.181"') { Write-Host "+ 3.74.181" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($page -notmatch "table: 'vendor_refund_requests'") {
    Write-Host "X vendor_refund_requests realtime subscription missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ vendor_refund_requests realtime subscription wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_181.txt"
    $msgLines = @(
        "feat(suppliers): v3.74.181 - realtime updates for vendor refund requests",
        "",
        "Tester observation on /suppliers:",
        "  Suppliers, vendor_credits, bills, and payments already refresh",
        "  in realtime via useRealtimeTable, but vendor_refund_requests",
        "  did not. So:",
        "    - When an accountant submitted a refund, the manager in",
        "      another tab didn't see it in the approval queue until",
        "      they refreshed.",
        "    - When the manager approved or rejected, the accountant did",
        "      not see the pill flip or the history row update until",
        "      they refreshed.",
        "    - The refund_history tab stayed stale the same way.",
        "",
        "Fix:",
        "",
        "  app/suppliers/page.tsx",
        "    - Adds a fourth useRealtimeTable subscription, on",
        "      vendor_refund_requests, that calls loadRefundRequests on",
        "      every insert / update / delete. This refreshes:",
        "        * the per-row '⏳ pending / ✓ approved' pill,",
        "        * the 'اعتمادات الاسترداد' approver queue badge + list,",
        "        * the 'سِجِل الاسترداد' tab.",
        "      Branch governance still flows through loadRefundRequests",
        "      itself - the accountant only ever sees their own branch's",
        "      rows.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.181.",
        "",
        "How to verify:",
        "  - Open /suppliers in two tabs, one as the accountant and one",
        "    as the owner.",
        "  - Accountant submits a refund. Within a second the owner tab",
        "    shows the new row in 'اعتمادات الاسترداد' with the badge",
        "    counter incrementing, and the supplier row's pill flips to",
        "    'قَيد الاعتماد' in the accountant's tab.",
        "  - Owner rejects the request. The accountant's pill clears",
        "    and the 'استرداد نقدى' button reappears within the realtime",
        "    propagation window. The 'سِجِل الاسترداد' tab gains the",
        "    rejection row for both users instantly."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.181 pushed" -ForegroundColor Green
}
