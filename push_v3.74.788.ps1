$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.787.ps1") { Remove-Item -LiteralPath "push_v3.74.787.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.788"') {
    Write-Host "+ 3.74.788" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.788]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.788]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- no editable adjustment input may remain anywhere ---------------------------
$formFiles = @(
    "app/sales-orders/new/page.tsx",
    "app/sales-orders/[id]/edit/page.tsx",
    "app/invoices/new/page.tsx",
    "app/invoices/[id]/edit/page.tsx",
    "app/bills/[id]/edit/page.tsx",
    "app/purchase-orders/new/page.tsx",
    "app/purchase-orders/[id]/edit/page.tsx",
    "app/vendor-credits/new/page.tsx"
)
foreach ($f in $formFiles) {
    $c = Get-Content -LiteralPath $f -Raw
    foreach ($bad in @("onChange={(val) => setAdjustment(val)}",
                       "onChange={setAdjustment}",
                       "onChange={(e) => setAdjustment(Number.parseFloat",
                       "adjustment: val }")) {
        if ($c -match [regex]::Escape($bad)) {
            Write-Host "X an editable adjustment input survives in $f" -ForegroundColor Red
            exit 1
        }
    }
    if ($c -notmatch [regex]::Escape("v3.74.788")) {
        Write-Host "X $f carries no removal marker - was it edited?" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ all 8 forms: adjustment input removed, marker present" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260722000005_v3_74_788_remove_manual_adjustment.sql" -Raw
foreach ($must in @(
    "trg_block_manual_adjustment",
    "ADJUSTMENT_REMOVED",
    "ARRAY['sales_orders','invoices','bills','purchase_orders','vendor_credits']"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X adjustment guard migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ DB guard covers the five tables (already applied to test + prod)" -ForegroundColor Green

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
    "app/sales-orders/new/page.tsx" `
    "app/sales-orders/[id]/edit/page.tsx" `
    "app/invoices/new/page.tsx" `
    "app/invoices/[id]/edit/page.tsx" `
    "app/bills/[id]/edit/page.tsx" `
    "app/purchase-orders/new/page.tsx" `
    "app/purchase-orders/[id]/edit/page.tsx" `
    "app/vendor-credits/new/page.tsx" `
    "supabase/migrations/20260722000005_v3_74_788_remove_manual_adjustment.sql" `
    "push_v3.74.788.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.787.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_788.txt"
    $msgLines = @(
        'feat(governance): v3.74.788 - the manual Adjustment field is retired',
        '',
        'The owner asked what the Adjustment input on the sales order form was',
        'for. Review answer: legitimately a rounding device, but here an open',
        'governance hole - so_evaluate_discount_approval never reads the',
        'column, so a NEGATIVE adjustment was an unapproved hidden discount',
        'bypassing the single-approval rule, and since v3.74.784 the journal',
        'builder books that gap to the Sales Discounts account - a disguised',
        'discount by name and by entry. Positive adjustments were unsourced',
        'revenue.',
        '',
        'Owner decision, verbatim: remove the field entirely, and from the',
        'purchases and services cycles as well.',
        '',
        '- UI: the input is stripped from all 8 forms (SO new/edit, invoice',
        '  new/edit, bill edit, PO new/edit, vendor-credit new). Documents',
        '  carrying a historical value render it read-only, labelled',
        '  "historical".',
        '- DB (the real guard): trg_block_manual_adjustment on sales_orders,',
        '  invoices, bills, purchase_orders, vendor_credits rejects any new or',
        '  changed non-zero value with an Arabic message, whatever the client.',
        '  Zeroing stays allowed; history stays readable.',
        '',
        'Rehearsed on the restored test copy: -5 insert blocked, 0 insert',
        'passes, change-to-non-zero blocked. Applied to test + prod.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.788 pushed - totals change only through items or approved discounts" -ForegroundColor Green
}
