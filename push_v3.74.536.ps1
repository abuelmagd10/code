$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.536"') {
    Write-Host "+ 3.74.536" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($f in @(
    'app/api/aging-ap/route.ts',
    'app/api/aging-ap-base/route.ts',
    'app/api/aging-ar/route.ts',
    'app/api/aging-ar-base/route.ts'
)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch 'paid_amount') {
        Write-Host "X $f not reading paid_amount" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ aging reports read paid_amount directly" -ForegroundColor Green

$dpr = Get-Content -LiteralPath 'app/api/daily-payments-receipts/route.ts' -Raw
if ($dpr -notmatch 'base_currency_amount') {
    Write-Host "X daily-payments-receipts not using base_currency_amount" -ForegroundColor Red; exit 1
}
if ($dpr -notmatch '\.eq\("status", "approved"\)') {
    Write-Host "X daily-payments-receipts not filtering approved" -ForegroundColor Red; exit 1
}
Write-Host "+ daily-payments-receipts sums base currency + approved only" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_536.txt"
    $msgLines = @(
        'fix(reports): v3.74.536 - 5 operational reports now use FX-correct paid_amount',
        '',
        'Post v3.74.532-535 audit: trial balance, balance sheet, and GL-',
        'based reports read correctly because journal_entry_lines is now',
        'in base currency. Five operational reports were still summing',
        'raw payments.amount and would have shown wrong outstandings.',
        '',
        'For BILL-0001 (0.10 USD @ 49.28 = 4.93 EGP), aging-ap would',
        'show outstanding 6.21 EGP instead of the true 1.38 EGP.',
        '',
        'Fix (Node only):',
        '  aging-ap, aging-ap-base: read bills.paid_amount (already FX-',
        '    converted and approval-filtered by fn_recalc_bill_paid_status)',
        '  aging-ar, aging-ar-base: read invoices.paid_amount (same, via',
        '    fn_recalc_invoice_paid_status)',
        '  daily-payments-receipts: sum base_currency_amount instead of',
        '    amount, and filter status=approved so pending payments do',
        '    not inflate daily cash-flow totals',
        '',
        'Historical as-of-date aging remains the GL endpoints scope',
        '(aging-ap-gl / aging-ar-gl); the operational reports treat',
        'endDate as today.',
        '',
        'Files',
        '  app/api/aging-ap/route.ts',
        '  app/api/aging-ap-base/route.ts',
        '  app/api/aging-ar/route.ts',
        '  app/api/aging-ar-base/route.ts',
        '  app/api/daily-payments-receipts/route.ts',
        '  supabase/migrations/20260705000536_...sql',
        '  lib/version.ts -> 3.74.536'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.536 pushed - reports honest about FX + status" -ForegroundColor Green
}
