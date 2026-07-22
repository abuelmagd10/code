$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.784.ps1") { Remove-Item -LiteralPath "push_v3.74.784.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.785"') {
    Write-Host "+ 3.74.785" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.785]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.785]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- owner rule: revenue at delivery — positively asserted ----------------------
$eng = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
foreach ($must in @(
    "const deferRevenueToDelivery =",
    "invoiceData.warehouse_status === 'pending'",
    "Revenue journal deferred to warehouse delivery approval",
    "Deferred revenue journal attached to warehouse approval transaction",
    "journalEntries.push(deferredRevenueJournal)"
)) {
    if ($eng -notmatch [regex]::Escape($must)) {
        Write-Host "X revenue-at-delivery sequencing incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ revenue journal deferred to delivery; built inside the approval transaction" -ForegroundColor Green

$val = Get-Content -LiteralPath "app/api/accounting-validation/route.ts" -Raw
$pendingExclusions = ([regex]::Matches($val, [regex]::Escape('inv.warehouse_status === "pending"'))).Count
if ($pendingExclusions -lt 2) {
    Write-Host "X accounting-validation must exclude dispatch-queue invoices in BOTH tests (found $pendingExclusions)" -ForegroundColor Red
    exit 1
}
Write-Host "+ validation checker knows the new rule (journal + COGS tests)" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260722000002_v3_74_785_payment_requires_revenue_je.sql" -Raw
foreach ($must in @(
    "CREATE TRIGGER trg_payment_requires_revenue_je",
    "PAYMENT_BEFORE_DELIVERY",
    "app.skip_je_check"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X payment gate migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ payment gate migration present (already applied to test + prod)" -ForegroundColor Green

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
    "lib/accounting-transaction-service.ts" `
    "app/api/accounting-validation/route.ts" `
    "supabase/migrations/20260722000002_v3_74_785_payment_requires_revenue_je.sql" `
    "push_v3.74.785.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.784.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_785.txt"
    $msgLines = @(
        'feat(accounting): v3.74.785 - revenue is recognized at DELIVERY, not at send',
        '',
        'Owner rule, verbatim: the revenue journal must be created AFTER the',
        'branch warehouse manager approves delivery to the customer - and',
        'collection only after delivery. Matches IFRS 15 (control transfer).',
        '',
        'Old sequencing: "mark as sent" wrote the revenue journal immediately,',
        'before any goods left stock. Latent defect found during review: an',
        'unpaid warehouse REJECTION reverted the invoice to draft while its',
        'revenue journal stayed alive in the ledger - an orphan entry for a',
        'draft document. The new sequencing removes that state entirely.',
        '',
        'New sequencing: send = status + notify warehouse (no journal). The',
        'deferred revenue journal is built at approval time and rides the SAME',
        'approve_sales_delivery_v2 transaction as the stock-out and COGS -',
        'post_accounting_event_v2 delegates journal insertion to the exact',
        'function the posting path used, so the payload shape is proven.',
        'Deferral is gated on warehouseApprovalV2 (V1 RPC cannot carry a',
        'journal payload) and only for shipping-provider invoices - the same',
        'criterion that already defers inventory + COGS. Service-only invoices',
        'post at send (nothing awaits dispatch); no-manager branches keep the',
        'v3.74.664 auto-approve, so journal and stock-out land together.',
        '',
        'New DB gate trg_payment_requires_revenue_je blocks the payment ROW',
        'itself when the linked invoice has no posted revenue journal - the',
        'sibling of require_revenue_je_before_paid, honoring the same',
        'app.skip_je_check hatch. Applied to test + prod.',
        '',
        'accounting-validation tests 4 and 5 now exclude sent invoices still',
        'in the dispatch queue - legitimately journal-less and COGS-less.',
        '',
        'Rehearsed on the restored test copy, fully rolled back: send creates',
        'no journal; approval creates a posted balanced journal (798/798) and',
        'approves dispatch in one transaction; pre-delivery payment blocked',
        'with the Arabic message; post-approval payment inserts clean.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.785 pushed - revenue at delivery, collection after delivery" -ForegroundColor Green
}
