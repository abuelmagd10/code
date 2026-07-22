$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.782.ps1") { Remove-Item -LiteralPath "push_v3.74.782.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.783"') {
    Write-Host "+ 3.74.783" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.783]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.783]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the owner's rule, asserted positively -------------------------------------
$svc = Get-Content -LiteralPath "lib/services/sales-order-notification.service.ts" -Raw
if ($svc -notmatch [regex]::Escape("if (params.linkedInvoiceId) {")) {
    Write-Host "X the accountant dispatch is no longer gated on an invoice existing" -ForegroundColor Red
    exit 1
}
if ($svc -match [regex]::Escape("أمر بيع جديد في فرعكم")) {
    Write-Host "X the bare-order fallback notification to the accountant is back" -ForegroundColor Red
    exit 1
}
if ($svc -notmatch [regex]::Escape("created_management_visibility")) {
    Write-Host "X the leadership visibility notification was lost - only the accountant fallback should go" -ForegroundColor Red
    exit 1
}
Write-Host "+ accountant is notified about invoices only; leadership visibility intact" -ForegroundColor Green

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
    "lib/services/sales-order-notification.service.ts" `
    "docs/HANDOVER_2026-07-21.md" `
    "push_v3.74.783.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.782.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_783.txt"
    $msgLines = @(
        'fix(notifications): v3.74.783 - the accountant is notified about invoices, never sales orders',
        '',
        'The owner, during live testing of the single-approval cycle: why does the',
        'accountant get a "sales order created" notification? Orders are not his',
        'concern - his work starts once the linked invoice exists.',
        '',
        'SalesOrderNotificationService was a leftover of the old flow, where order',
        'and invoice were born in the same request: notify about the invoice if',
        'present, else FALL BACK to notifying about the bare order. Under',
        'v3.74.782 an order with a pending discount has no invoice yet - and may',
        'be rejected and never get one - so the fallback was noise about a',
        'document outside his role.',
        '',
        'The fallback is removed: the accountant dispatch now runs only when a',
        'linked invoice exists. No-discount orders still notify him immediately',
        '(invoice is born in the same request); discounted orders notify him at',
        'approval time via the existing invoice-creation path - proven by the',
        'owner''s own live test, where the accountant received the invoice',
        'notification after approval. Leadership visibility of new orders is',
        'unchanged.',
        '',
        'Also recorded from the same test session (handover, cosmetic): the',
        'invoice notification text showed "0.00 EGP" because it was composed in',
        'the instant before totals recomputation - the invoice data itself is',
        'correct (274.60, verified). Same transient-zero family, fourth sighting.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.783 pushed - invoices for the accountant, orders for leadership" -ForegroundColor Green
}
