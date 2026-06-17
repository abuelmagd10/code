$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.197.ps1") { Remove-Item -LiteralPath "push_v3.74.197.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.198"') {
    Write-Host "+ 3.74.198" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mgr = Get-Content -LiteralPath "lib/realtime-manager.ts" -Raw
if ($mgr -notmatch "'customer_credits'") {
    Write-Host "X realtime-manager missing customer_credits" -ForegroundColor Red; exit 1
}
if ($mgr -notmatch "'customer_credit_ledger'") {
    Write-Host "X realtime-manager missing customer_credit_ledger" -ForegroundColor Red; exit 1
}
Write-Host "+ realtime-manager wired" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
$expected = @("table: 'customer_credits'","table: 'customer_credit_ledger'","table: 'payments'","table: 'invoices'")
foreach ($exp in $expected) {
    if ($page -notmatch [regex]::Escape($exp)) {
        Write-Host "X customers page missing realtime: $exp" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ 4 new realtime subscriptions in customers page" -ForegroundColor Green

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000198_v3_74_198_realtime_customer_credit_ledger.sql")) {
    Write-Host "X missing migration file" -ForegroundColor Red; exit 1
}
Write-Host "+ migration present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_198.txt"
    $msgLines = @(
        "fix(customers): v3.74.198 - realtime refresh after a credit refund is approved",
        "",
        "Symptom: branch accountant submits a customer credit refund, owner",
        "approves it, the JE posts correctly - but the customers page keeps",
        "showing the pre-refund balance until the user navigates away and",
        "back.",
        "",
        "Cause: the page subscribed only to the `customers` table. The",
        "approval flow writes to customer_credits + customer_credit_ledger",
        "(and indirectly payments / invoices when the refund is settled).",
        "Without subscriptions on those tables, the realtime channel never",
        "fires a refresh.",
        "",
        "Fix:",
        "  - app/customers/page.tsx adds four useRealtimeTable hooks",
        "    (customer_credits, customer_credit_ledger, payments, invoices),",
        "    all routed through the existing handleCustomersRealtimeEvent",
        "    so they call loadCustomers in the same throttle path.",
        "  - lib/realtime-manager.ts adds customer_credits and",
        "    customer_credit_ledger to the RealtimeTable union and the",
        "    table mapping. Without this the new subscriptions would not",
        "    type-check.",
        "  - 20260617000198 migration adds customer_credit_ledger to the",
        "    supabase_realtime publication (customer_credits / payments /",
        "    invoices were already in it). Idempotent.",
        "",
        "Same pattern the suppliers page has had since v3.74.181."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.198 pushed" -ForegroundColor Green
}
