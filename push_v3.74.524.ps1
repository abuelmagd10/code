$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.523.ps1") { Remove-Item -LiteralPath "push_v3.74.523.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.524"') {
    Write-Host "+ 3.74.524" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pp = Get-Content -LiteralPath "app/payments/page.tsx" -Raw

# Guard 1: correctionFields must carry currency + rate
if ($pp -notmatch 'original_currency: string; exchange_rate: string') {
    Write-Host "X correctionFields missing currency/rate" -ForegroundColor Red
    exit 1
}
Write-Host "+ correctionFields extended" -ForegroundColor Green

# Guard 2: modal must render rejection reason banner
if ($pp -notmatch 'سَبَب رَفض المالِك') {
    Write-Host "X rejection reason banner missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ rejection reason banner present" -ForegroundColor Green

# Guard 3: modal must render currency label with amount
if ($pp -notmatch 'correctionPayment\.original_currency \|\| correctionPayment\.currency_code \|\| ''EGP''') {
    Write-Host "X original-amount line missing currency label" -ForegroundColor Red
    exit 1
}
Write-Host "+ original amount labelled with currency" -ForegroundColor Green

# Guard 4: proposed-changes currency + rate inputs present
if ($pp -notmatch 'العُملَة') {
    Write-Host "X currency dropdown missing from proposed changes" -ForegroundColor Red
    exit 1
}
if ($pp -notmatch 'سعر الصرف \(إلى الجنيه\)') {
    Write-Host "X exchange-rate input missing from proposed changes" -ForegroundColor Red
    exit 1
}
Write-Host "+ currency + FX inputs present" -ForegroundColor Green

# Guard 5: server accepts and re-derives
$route = Get-Content -LiteralPath 'app/api/payments/[id]/resubmit-after-reject/route.ts' -Raw
if ($route -notmatch 'original_currency\?: string') {
    Write-Host "X resubmit-after-reject route missing original_currency in body type" -ForegroundColor Red
    exit 1
}
if ($route -notmatch 'base_currency_amount = Number\(\(effectiveAmount \* effectiveRate\)') {
    Write-Host "X resubmit-after-reject route not recomputing base_currency_amount" -ForegroundColor Red
    exit 1
}
Write-Host "+ server whitelists currency + re-derives base amount" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_524.txt"
    $msgLines = @(
        'feat(payments): v3.74.524 - correction modal handles currency, FX and rejection reason',
        '',
        'Owner rejected a USD payment. Accountant opened the correction',
        'modal to fix it and found:',
        '  - amount shown as "0.1" with no currency label',
        '  - no owner rejection reason anywhere in the dialog',
        '  - no way to change the currency or FX rate (only account +',
        '    method + amount + date + reference + notes were editable)',
        'For a payment rejected because it was recorded in the wrong',
        'currency, there was literally no path to fix it here.',
        '',
        'Fix:',
        '  Original block   - amount now carries the currency label and,',
        '                     for non-EGP payments, the base EGP amount',
        '                     and the exchange rate used.',
        '  Red banner       - "sabab rafd al-malik: <text>" at the top',
        '                     when the row has a rejection_reason.',
        '  Proposed changes - added currency dropdown (blank = keep) and',
        '                     FX rate input (blank = auto-derive).',
        '  Server           - resubmit-after-reject route whitelists the',
        '                     new fields and recomputes original_currency,',
        '                     currency_code, exchange_rate,',
        '                     exchange_rate_used, original_amount, and',
        '                     base_currency_amount as a coherent triple.',
        '',
        'Files',
        '  app/payments/page.tsx (state + modal + submit)',
        '  app/api/payments/[id]/resubmit-after-reject/route.ts',
        '  supabase/migrations/20260703000524_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.524'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.524 pushed - accountant can now fix the currency, not just the amount" -ForegroundColor Green
}
