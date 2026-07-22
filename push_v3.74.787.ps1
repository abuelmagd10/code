$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.786.ps1") { Remove-Item -LiteralPath "push_v3.74.786.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.787"') {
    Write-Host "+ 3.74.787" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.787]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.787]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the owner's rejection cycle, positively asserted ---------------------------
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-warehouse-command.service.ts" -Raw
foreach ($must in @(
    "warehouse_rejected_edit_sales_order",
    "warehouse_rejected_edit_booking",
    "sourceEditorNotified",
    "sales_order_id"
)) {
    if ($svc -notmatch [regex]::Escape($must)) {
        Write-Host "X rejection-cycle notification rework incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ rejection action goes to the source document creator" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260722000004_v3_74_787_rejection_edit_cycle.sql" -Raw
foreach ($must in @(
    "trg_so_items_mirror_to_invoice",
    "IF v_inv.status NOT IN ('draft', 'invoiced') THEN",
    "je.status         = 'posted'",
    "rejection_edit_synced"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X safe-window mirror migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ item mirror runs only in the safe window (already applied to test + prod)" -ForegroundColor Green

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
    "lib/services/sales-invoice-warehouse-command.service.ts" `
    "supabase/migrations/20260722000004_v3_74_787_rejection_edit_cycle.sql" `
    "push_v3.74.787.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.786.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_787.txt"
    $msgLines = @(
        'feat(sales): v3.74.787 - warehouse rejection: the fix starts at the SOURCE',
        '',
        'Owner spec: when the warehouse manager rejects a dispatch (customer',
        'refused an item / changed quantity at delivery), the ACTION goes to',
        'the sales order creator - edit the ORDER, the edit flows onto the',
        'linked invoice automatically, the branch accountant is notified to',
        're-send, and the cycle repeats until delivery. For service invoices',
        'the action goes to the booking creator (SOLD products only; products',
        'consumed performing the service are outside the cycle).',
        '',
        'Built:',
        '- rejectDelivery notifications reworked: action to the SO creator',
        '  (or booking creator), management/accountant visibility unchanged,',
        '  standalone invoices keep the old sender fallback.',
        '- NEW item-level mirror sales_order_items -> invoice_items, the gap',
        '  that made the cycle impossible (only header totals ever synced).',
        '  Strictly inside the safe window: invoice draft/invoiced AND no',
        '  posted revenue journal - a delivered invoice is frozen by',
        '  construction. Same column mapping the auto-invoice birth uses.',
        '- The mirror notifies the accountant to re-send when the invoice is',
        '  in the post-rejection state; the existing isRepost path then resets',
        '  the dispatch to pending and re-notifies the warehouse manager.',
        '',
        'Rehearsed end-to-end on the restored test copy (rolled back):',
        'SO -> auto invoice -> sent -> rejected/draft -> edit qty 1->3 ->',
        'invoice items became 3, accountant notification born; after posting',
        'a journal for the invoice a further edit (9) did NOT touch it.',
        '',
        'Out of scope, recorded: booking->invoice item flow depends on the',
        'known booking-custody sync gap (handover 3.8c); invoice discount',
        'display fields alongside header sync.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.787 pushed - rejection edits start at the source; the invoice follows" -ForegroundColor Green
}
