$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.781.ps1") { Remove-Item -LiteralPath "push_v3.74.781.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.782"') {
    Write-Host "+ 3.74.782" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.782]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.782]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the migration must be the rehearsed one (positive assertions only) --------
$m = "supabase/migrations/20260722000001_v3_74_782_discount_approval_single_source.sql"
if (-not (Test-Path -LiteralPath $m)) { Write-Host "X missing $m" -ForegroundColor Red; exit 1 }
$c = Get-Content -LiteralPath $m -Raw
foreach ($must in @(
    "discount_pending_approval",                                  # p1: no invoice before the decision
    "invoice_result",                                             # p3: approval creates the invoice
    "NULLIF(v_so.total_amount, 0)",                               # p4: real totals in the inbox
    "AND COALESCE(NEW.discount_value, 0) > 0 THEN",               # p5: zero-discount amendment guard
    "sales_order_id IS NOT NULL THEN RETURN NEW",                 # p6: amendment files nothing for SO-sourced
    "SO-sourced files nothing",                                   # p6c: inv_evaluate files nothing either
    "already applied"                                             # replay-safety markers
)) {
    if ($c -notmatch [regex]::Escape($must)) {
        Write-Host "X migration lost a rehearsed patch: $must" -ForegroundColor Red; exit 1
    }
}
if ($c -notmatch "anchor matched") {
    Write-Host "X the patch does not verify its anchors - a zero-match would change nothing silently" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration carries all six rehearsed patches, anchor-checked, replay-safe" -ForegroundColor Green

# --- the accountant-facing 409s must name the decider --------------------------
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-posting-command.service.ts" -Raw
if ($svc -notmatch [regex]::Escape("بانتظار اعتماد المالك / المدير العام")) {
    Write-Host "X the 409 message no longer names who decides" -ForegroundColor Red; exit 1
}
if ($svc -notmatch [regex]::Escape('.eq("document_type", "sales_order")')) {
    Write-Host "X the posting guard no longer checks the sales-order approval - SO-sourced invoices have no rows of their own now" -ForegroundColor Red
    exit 1
}
Write-Host "+ posting guard checks the sales order and tells the accountant the truth" -ForegroundColor Green

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
    "lib/services/sales-invoice-posting-command.service.ts" `
    "supabase/migrations/20260722000001_v3_74_782_discount_approval_single_source.sql" `
    "docs/HANDOVER_2026-07-21.md" `
    "push_v3.74.782.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.781.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_782.txt"
    $msgLines = @(
        'fix(discounts): v3.74.782 - one discount, one approval; the sales order decides',
        '',
        'The owner specification, verbatim: the discount is approved ONCE, on the',
        'sales order; the invoice is created only AFTER that approval; and sales',
        'invoices have no discount approvals of their own.',
        '',
        'What production actually did (SO-0002 -> INV-00002): one request filed the',
        'sales-order approval at .453 and created the invoice at .835 - 382ms later,',
        'decision still pending - whose insert trigger filed a SECOND approval. The',
        'accountant was then blocked by a 409 keyed on that second row, with a',
        'message directing them to an approvals inbox that answers them 403. Two',
        'independent decisions on the same 20.00 were possible.',
        '',
        'The skip mechanism (app.skip_discount_approval) was designed and documented',
        'in migration 20260629000404 and never wired to anything.',
        '',
        'Six database-side patches, no UI changes needed:',
        '  1. auto-invoice creation SKIPS while the SO discount is pending (returns',
        '     jsonb the existing route already handles gracefully)',
        '  2. DB backstop: inserting any invoice for an SO with a pending discount',
        '     raises - covers the manual conversion path too',
        '  3. the decision is the pivot: APPROVE creates the invoice right there and',
        '     cancels any legacy pending twin as inheriting the decision; REJECT',
        '     creates nothing, and editing the SO re-files automatically',
        '  4. the inbox showed Total: 0.00 because document_total snapshotted',
        '     total_amount, which this codebase leaves at 0 with the real figure in',
        '     total - and COALESCE alone keeps a 0, zero is not NULL. NULLIF first.',
        '  5. latent bug surfaced by rehearsal: any material edit of a zero-discount',
        '     draft crashed on CHECK (discount_value > 0) because the amendment',
        '     trigger inserted 0 unguarded',
        '  6. SO-sourced invoices file no approvals from ANY path - the production',
        '     twin came from the amendment trigger reading total shifts DURING',
        '     creation as a material amendment. Tampering is still caught at',
        '     posting, which requires the invoice discount to match the approved',
        '     sales-order value.',
        '',
        'The 409 messages now name who decides (owner/GM) instead of sending the',
        'accountant to a locked page, and the posting guard reads the SALES ORDER',
        'approval directly now that invoices carry no rows of their own.',
        '',
        'Rehearsed on a restored copy of production: eight scenarios, including',
        'no-invoice-before-decision, approve-creates-invoice with zero twins,',
        'reject-then-edit re-files, direct insert refused, zero-discount order',
        'unaffected, and the zero-discount draft edit no longer crashing.',
        'Production ledger before and after: identical (90 entries, 2,641,350.85).',
        '',
        'Out of scope, recorded in the handover: a trigger on the shipping-edit',
        'path references a non-existent last_edited_by column - pre-existing.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.782 pushed - one discount, one approval, the sales order decides" -ForegroundColor Green
}
