$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.183.ps1") { Remove-Item -LiteralPath "push_v3.74.183.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.184"') { Write-Host "+ 3.74.184" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($page -match "if \(currentUserRole\)\s*\{\s*loadRefundRequests") {
    Write-Host "X loadRefundRequests still gated on currentUserRole" -ForegroundColor Red
    exit 1
}
Write-Host "+ refund requests loader runs unconditionally on mount" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_184.txt"
    $msgLines = @(
        "fix(customers): v3.74.184 - pending pill did not show after submitting refund",
        "",
        "Tester report on v3.74.183:",
        "  Accountant filed a credit refund. DB confirms",
        "  customer_refund_requests row is in status='pending' for the",
        "  customer and branch. Owner inbox got the notification. But the",
        "  '💰 صرف' button was still showing on the customer row, so the",
        "  accountant could submit a duplicate request.",
        "",
        "Root cause:",
        "  Two issues stacked:",
        "  1) loadRefundRequests was gated on currentUserRole. There's a",
        "     brief window between the page mounting and the role being",
        "     fetched where the gate keeps the loader from running, and",
        "     because the dependency array also referenced",
        "     userContext?.branch_id (which loads later still), the",
        "     re-run could be missed on slow networks.",
        "  2) The SELECT joined three other tables (customers, branches,",
        "     chart_of_accounts via FK). Cross-table joins like that can",
        "     400 silently under some RLS configurations and the catch",
        "     just swallowed it. Net result: refundRequests stayed [],",
        "     the row guard saw nothing in flight, and the button kept",
        "     rendering.",
        "",
        "Fix:",
        "  app/customers/page.tsx",
        "    - Loader query trimmed to flat columns only. Every field the",
        "      pill / history needs is now on customer_refund_requests",
        "      itself; the customer / branch / refund_account labels can",
        "      be looked up locally from already-loaded state, so the",
        "      joins were dead weight.",
        "    - useEffect no longer guards on currentUserRole. The loader",
        "      is safe to call before the role resolves - it returns the",
        "      full company set until the role narrows the branch filter.",
        "    - Adds a small console.log so the next time something looks",
        "      stuck the row count and current role land in the console.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.184.",
        "",
        "How to verify:",
        "  - As branch accountant, open /customers. The console should",
        "    log '[customer-refund] loaded N rows for role accountant'",
        "    almost immediately after the page renders.",
        "  - On a customer with a pending request, the action cell now",
        "    shows '⏳ قَيد الاعتماد' instead of the active button.",
        "  - As owner, approve or reject in another tab. The pill flips",
        "    in realtime; rejection brings the active button back."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.184 pushed" -ForegroundColor Green
}
