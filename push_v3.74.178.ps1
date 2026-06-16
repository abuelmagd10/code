$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.177.ps1") { Remove-Item -LiteralPath "push_v3.74.177.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.178"') { Write-Host "+ 3.74.178" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($page -match "PRIVILEGED_ROLES\.includes\(currentUserRole\.toLowerCase\(\)\)\)\s*\{\s*loadRefundRequests") {
    Write-Host "X loadRefundRequests still gated on privileged roles" -ForegroundColor Red
    exit 1
}
if ($page -notmatch "activeRefund") {
    Write-Host "X active refund guard missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ accountant loads refund requests; button respects status" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_178.txt"
    $msgLines = @(
        "fix(suppliers): v3.74.178 - accountant sees their own pending refund request",
        "",
        "Tester report after v3.74.177:",
        "  Branch accountant still sees the 'استرداد نقدى' button on",
        "  محمد الصاوى even after submitting a pending refund request.",
        "  Owner sees the pending pill correctly; only the accountant",
        "  bypasses it. Spec from the tester:",
        "  'يظهر مرة اخرة فقط فى حالة رفض الادارة العليا'",
        "",
        "Root cause:",
        "  app/suppliers/page.tsx wired loadRefundRequests behind",
        "    if (PRIVILEGED_ROLES.includes(currentUserRole))",
        "  PRIVILEGED_ROLES is owner / admin / general_manager. The branch",
        "  accountant never qualifies, so refundRequests stayed [], the",
        "  guard saw no in-flight request, and the button rendered.",
        "  v3.74.177's pill therefore worked for managers and not the",
        "  accountant who actually submitted the request.",
        "",
        "Also: the v3.74.177 guard only blocked the button for",
        "status='pending_approval'. The check_constraint on",
        "vendor_refund_requests allows 'approved' too - that's the state",
        "between management approval and execution. In that window the",
        "accountant should still NOT be able to resubmit.",
        "",
        "Fix:",
        "  app/suppliers/page.tsx",
        "    - useEffect that loads refundRequests now runs for any",
        "      authenticated role (drop the PRIVILEGED_ROLES gate). RLS",
        "      still constrains what each role can read.",
        "    - The actions render-guard widened to block the button when",
        "      ANY refundRequests row for the supplier has status in",
        "      ('pending_approval', 'approved'). 'approved' renders a",
        "      green '✓ استرداد مُعتَمَد' pill instead of the amber",
        "      'pending' pill so the accountant can tell where the",
        "      request is in the workflow.",
        "    - rejected / cancelled remain the only states that let the",
        "      button reappear, matching the tester's spec.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.178.",
        "",
        "How to verify:",
        "  - As branch accountant in مدينة نصر, open /suppliers and look",
        "    at محمد الصاوى. The actions cell now shows '⏳ استرداد قَيد",
        "    الاعتماد' instead of the active button.",
        "  - As owner, approve the request. Accountant cell now shows",
        "    '✓ استرداد مُعتَمَد'. Still no resubmit button.",
        "  - As owner, reject a future request. Accountant cell flips",
        "    back to the active 'استرداد نقدى' button so they can fix",
        "    and resubmit."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.178 pushed" -ForegroundColor Green
}
