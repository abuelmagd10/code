$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.783.ps1") { Remove-Item -LiteralPath "push_v3.74.783.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.784"') {
    Write-Host "+ 3.74.784" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.784]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.784]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the balancing line must exist, positively asserted -------------------------
$eng = Get-Content -LiteralPath "lib/accrual-accounting-engine.ts" -Raw
foreach ($must in @(
    "const gapAmount = round2(netAmount + vatAmount + shippingAmount - totalAmount)",
    "خصم مسموح به (بعد الضريبة)",
    "mapping.sales_discount || mapping.sales_revenue",
    "sales_discount: findAccount('sales_discounts')"
)) {
    if ($eng -notmatch [regex]::Escape($must)) {
        Write-Host "X the after-tax discount balancing line is incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ revenue journal balances by construction (after-tax discount + adjustment)" -ForegroundColor Green

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
    "lib/accrual-accounting-engine.ts" `
    "push_v3.74.784.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.783.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_784.txt"
    $msgLines = @(
        'fix(accounting): v3.74.784 - after-tax discount invoices could never be posted',
        '',
        'Found at the finale of the owner''s live test of the single-approval cycle:',
        'the accountant clicked post on INV-00002 (10% after-tax discount) and the',
        'balance guard refused it - UNBALANCED_JOURNAL_PAYLOAD, Debit=274.60,',
        'Credit=294.00. The 19.40 gap is exactly the discount.',
        '',
        'prepareInvoiceRevenueJournal debits AR with the invoice TOTAL (net of',
        'everything) and credits revenue + VAT + shipping - the PRE-discount',
        'components - and never reads the discount at all. Before-tax discounts',
        'survived by luck: subtotal arrives already net. After-tax discounts made',
        'every such invoice permanently unpostable. Fifth never-executed-path',
        'defect this week. The DB balance guard is the hero: no crooked entry',
        'ever reached the ledger.',
        '',
        'The fix balances by construction: the gap is computed from the very',
        'numbers just placed on the lines - (revenue + VAT + shipping) - total.',
        'Positive gap (after-tax discount) is debited to Sales Discounts (code',
        '4120, sub_type sales_discounts, already in the seeded COA) so the',
        'discount shows as contra-revenue; companies lacking the account net it',
        'against revenue and stay balanced. Negative gap (an adjustment raising',
        'the total) is credited symmetrically. FC invoices carry original_*',
        'values per IAS 21 like every other line.',
        '',
        'All push-script assertions for this release are positive - what the code',
        'MUST contain - per the lesson that negative checks match their own',
        'documentation.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.784 pushed - after-tax discounts can finally post, balanced by construction" -ForegroundColor Green
}
