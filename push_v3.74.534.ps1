$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.534"') {
    Write-Host "+ 3.74.534" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw

if ($ap -notmatch 'histAllocsByPay') {
    Write-Host "X history loader missing allocation batch" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'purchase_orders"\)\.select\("id, po_number"\)\.in\("id", histPoIds\)') {
    Write-Host "X history loader missing purchase_orders batch" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'chart_of_accounts"\)\.select\("id, account_name"\)\.in\("id", histAcctIds\)') {
    Write-Host "X history loader missing accounts batch" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'detail_lines: details') {
    Write-Host "X history entry not populating detail_lines" -ForegroundColor Red; exit 1
}
Write-Host "+ history loader enriched with allocation + PO + account" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_534.txt"
    $msgLines = @(
        'feat(approvals): v3.74.534 - history card for supplier payment now carries the same story as the live card',
        '',
        'Owner: I want the history entries to show the same data the live',
        'approval card shows. Before this release the supplier-payment',
        'history row carried only reference number, supplier name,',
        'raw amount + currency, requester and decider names + dates,',
        'status. No bill, PO, FX equivalent, method or source account.',
        '',
        'v3.74.534 populates the existing detail_lines field with three',
        'bullet lines rendered by the shared UnifiedHistoryCard:',
        '  Bill number + PO (+ N more if multi-allocation)',
        '  Amount in payment currency + EGP base + exchange rate',
        '  Method + source account name',
        '',
        'value_label also carries the base-EGP equivalent inline for',
        'non-EGP payments, so the amount at the top of the card no',
        'longer lies about currency.',
        '',
        'Loader changes:',
        '  - payments select adds exchange_rate, base_currency_amount,',
        '    payment_method, account_id.',
        '  - Batches payment_allocations, chart_of_accounts, then in a',
        '    second wave bills (bill_number + purchase_order_id) and',
        '    purchase_orders (po_number).',
        '  - Picks the largest allocation as the "primary" bill,',
        '    matching the v3.74.523 pending-inbox behaviour.',
        '',
        'Files',
        '  app/approvals/page.tsx (history loader)',
        '  supabase/migrations/20260705000534_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.534'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.534 pushed - history rows tell the whole story" -ForegroundColor Green
}
