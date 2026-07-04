$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.527"') {
    Write-Host "+ 3.74.527" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- approvals card fixes ----
$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -notmatch 'bill_currency: string \| null') {
    Write-Host "X interface missing bill_currency" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'bill_currency: primaryBill\?\.currency_code') {
    Write-Host "X loader not propagating bill.currency_code" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'const billCcy = p\.bill_currency \|\| "EGP"') {
    Write-Host "X card not using bill_currency for outstanding label" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'payInBase != null && outstandingInBase != null && payInBase > outstandingInBase') {
    Write-Host "X overpay comparison not normalized" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals card: outstanding in bill currency, base-normalized overpay" -ForegroundColor Green

# ---- bill view page: 3-way match fix ----
$bv = Get-Content -LiteralPath 'app/bills/[id]/page.tsx' -Raw
if ($bv -notmatch 'const returnsTotal = Number\(\(bill as any\)\.returned_amount \|\| 0\)') {
    Write-Host "X three-way match panel not subtracting returned_amount" -ForegroundColor Red; exit 1
}
if ($bv -notmatch 'netRemaining = bill\.total_amount - paidTotal - returnsTotal') {
    Write-Host "X netRemaining formula not updated" -ForegroundColor Red; exit 1
}
Write-Host "+ three-way match panel now subtracts returns" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_527.txt"
    $msgLines = @(
        'fix: v3.74.527 - honest currency + returns math on bill and approvals surfaces',
        '',
        'Two lies discovered while testing BILL-0001 (a 7.34 EGP bill with',
        'a 0.10 USD payment pending, and a 1.03 EGP partial return):',
        '',
        '1. /approvals payment card said "matbaqi al-fatura: 7.34 USD".',
        '   Bill was EGP; USD label came from p.currency (payment side),',
        '   not from the bill. Overpay check also compared USD 0.10',
        '   directly against EGP 7.34 -- coincidentally right, but a',
        '   landmine.',
        '   Fix: carry bill.currency_code as bill_currency, label',
        '   outstanding with it, normalize overpay check to base ccy',
        '   (only fires when both sides are known in base).',
        '',
        '2. bills/[id] Three-Way Match panel said "safy al-mutbaqi:',
        '   7.34" while the Payments card on the same page said "al-safy',
        '   al-mustahaq: 6.31" -- disagreeing over whether to subtract',
        '   returns. Line 2085 had a comment claiming total_amount was',
        '   already reduced by returns; the DB proves otherwise. Fix:',
        '   subtract bill.returned_amount too, matching the payment',
        '   summary at line 1897.',
        '',
        'Files',
        '  app/approvals/page.tsx (interface + loader + card)',
        '  app/bills/[id]/page.tsx (three-way match netRemaining)',
        '  supabase/migrations/20260703000527_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.527'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.527 pushed - two lies fixed, same story" -ForegroundColor Green
}
