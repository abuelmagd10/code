$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.793.ps1") { Remove-Item -LiteralPath "push_v3.74.793.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.794"') {
    Write-Host "+ 3.74.794" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.794]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.794]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- approval context on the SO page, positively asserted -----------------------
$page = Get-Content -LiteralPath "app/sales-orders/[id]/page.tsx" -Raw
foreach ($must in @(
    "const [dispatchInfo, setDispatchInfo]",
    "const [discountApproval, setDiscountApproval]",
    "'صرف الفاتورة المرتبطة'",
    "'اعتماد الخصم'",
    "warehouse_rejection_reason",
    "Number((item as any).line_total || 0)"
)) {
    if ($page -notmatch [regex]::Escape($must)) {
        Write-Host "X SO approval-context work incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ SO page shows dispatch decision + discount approval; item total falls back sanely" -ForegroundColor Green

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
    "app/sales-orders/[id]/page.tsx" `
    "push_v3.74.794.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.793.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_794.txt"
    $msgLines = @(
        'feat(sales): v3.74.794 - approval context lives where the action starts',
        '',
        'Owner suggestion during the live rejection-cycle test: the rejection',
        'notification lands the employee on the SALES ORDER - so the dispatch',
        'decision (who rejected, why) and the discount approval must be visible',
        'there, not one click away on the invoice.',
        '',
        'The SO detail page now carries both cards next to the order info:',
        '- Linked invoice dispatch: status chip, decision actor + date, the',
        '  rejection reason, and the action hint (edit THIS order - it flows to',
        '  the invoice automatically, the accountant re-sends).',
        '- Discount approval: status, amount, decider, date, note - the same',
        '  card the invoice page gained in v3.74.791.',
        '',
        'Same release: the SO items table showed a real line as GBP 0.00',
        '(live-caught on SO-0003) because edits persist line_total only while',
        'the cell read total/subtotal. It now falls back through line_total',
        'with tax, then a full computed gross.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.794 pushed - the SO page tells the employee the whole story" -ForegroundColor Green
}
