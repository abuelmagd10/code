$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.809.ps1") { Remove-Item -LiteralPath "push_v3.74.809.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.810"') {
    Write-Host "+ 3.74.810" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.810]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.810]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- (a) single sender for supplier-payment approval requests ------------------
$apiPay = Get-Content -LiteralPath "app/api/supplier-payments/route.ts" -Raw
if ($apiPay -match "notifyApprovalRequested") {
    Write-Host "X supplier-payments API still sends its own approval request" -ForegroundColor Red; exit 1
}
$allocUI = Get-Content -LiteralPath "components/payments/SupplierPaymentAllocationUI.tsx" -Raw
if ($allocUI -match "notifyPaymentApprovalRequest") {
    Write-Host "X allocation UI still sends the legacy approval request" -ForegroundColor Red; exit 1
}
Write-Host "+ one sender remains: the DB trigger (owner + GM, every entry path)" -ForegroundColor Green

# --- (b) system accounts locked ------------------------------------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000003_v3_74_810_system_accounts_locked.sql" -Raw
foreach ($must in @("SET is_system = TRUE", "purchase_discounts")) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X system-accounts migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
if ($mig -notmatch "is_active, TRUE\) = TRUE AND COALESCE\(NEW\.is_active, TRUE\) = FALSE") {
    Write-Host "X deactivation guard missing from the migration" -ForegroundColor Red; exit 1
}
Write-Host "+ critical accounts: no delete, no deactivate, no archive" -ForegroundColor Green

# --- (c) effective outstanding in the unpaid-bills list ------------------------
$pay = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
foreach ($must in @("pending_amount", "effectiveOutstanding")) {
    if ($pay -notmatch [regex]::Escape($must)) {
        Write-Host "X payments page: effective-outstanding wiring missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ unpaid-bills list now subtracts pending payments and disables Select at zero" -ForegroundColor Green

# --- (d) adjustment row hidden when zero ---------------------------------------
$billPg = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($billPg -notmatch [regex]::Escape("Number(bill.adjustment || 0) !== 0 && (")) {
    Write-Host "X bill page still renders the adjustment row unconditionally" -ForegroundColor Red; exit 1
}
Write-Host "+ legacy-only adjustment row" -ForegroundColor Green

# --- (e) discount-approvals returns clean empty for non-approvers --------------
$da = Get-Content -LiteralPath "app/api/discount-approvals/route.ts" -Raw
if ($da -notmatch [regex]::Escape("can_approve: false")) {
    Write-Host "X discount-approvals still 403s non-approvers" -ForegroundColor Red; exit 1
}
Write-Host "+ no more red 403s on every non-approver page load" -ForegroundColor Green

# --- (f) page no longer deletes the active SW cache ----------------------------
# (the comment-trap, third edition: the explanatory comment quotes the old
#  log line, so a naive -match on it false-positives. POSITIVE assertion on
#  the actual neutered function body instead.)
$reg = Get-Content -LiteralPath "public/sw-register.js" -Raw
if ($reg -notmatch "function clearOldCaches\(\)\s*\{\s*return Promise\.resolve\(\);\s*\}") {
    Write-Host "X sw-register clearOldCaches is not the neutered no-op" -ForegroundColor Red; exit 1
}
if ($reg -match "caches\.delete\(") {
    Write-Host "X sw-register still contains a caches.delete call" -ForegroundColor Red; exit 1
}
Write-Host "+ the SW's activate handler is the single cache janitor" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" `
    "app/api/supplier-payments/route.ts" `
    "components/payments/SupplierPaymentAllocationUI.tsx" `
    "supabase/migrations/20260724000003_v3_74_810_system_accounts_locked.sql" `
    "app/payments/page.tsx" `
    "app/bills/[id]/page.tsx" `
    "app/api/discount-approvals/route.ts" `
    "public/sw-register.js" `
    "push_v3.74.810.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.809.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$missing = @("app/api/supplier-payments/route.ts","components/payments/SupplierPaymentAllocationUI.tsx",
             "supabase/migrations/20260724000003_v3_74_810_system_accounts_locked.sql",
             "app/payments/page.tsx","app/bills/[id]/page.tsx",
             "app/api/discount-approvals/route.ts","public/sw-register.js") |
    Where-Object { $staged -notcontains $_ }
if ($missing) {
    Write-Host "X files failed to stage: $($missing -join ', ')" -ForegroundColor Red; exit 1
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_810.txt"
    $msgLines = @(
        'fix: v3.74.810 - six owner-reported findings in one package',
        '',
        '(a) ONE sender for supplier-payment approval requests: the DB',
        '    trigger stays (owner+GM, every entry path); the API-side and',
        '    legacy client-side duplicates are removed. The owner counted',
        '    three notifications for a single payment.',
        '(b) Critical accounts locked (migration 20260724000003): is_system',
        '    backfilled for existing companies; the guard now blocks delete,',
        '    deactivate, archive, and un-flagging - deactivating AP broke',
        '    posting exactly like deleting it and was allowed.',
        '(c) Unpaid-bills list shows EFFECTIVE outstanding: pending payment',
        '    allocations subtracted, pending badge, Select disabled at zero.',
        '(d) Bill page: adjustment row renders only for nonzero legacy values.',
        '(e) discount-approvals GET returns a clean empty list for',
        '    non-approvers instead of red-console 403s on every page load.',
        '(f) sw-register no longer deletes the ACTIVE v4.4.0 cache on every',
        '    load (its keep-list was pinned to v4.0.0); the SW activate',
        '    handler is the single cache janitor.',
        '',
        'DB changes applied to test + production and probed before this',
        'commit (deactivation blocked, deletion blocked, 4 companies marked).'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.810 pushed - six findings, six fixes, one package" -ForegroundColor Green
}
