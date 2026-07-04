$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.524.ps1") { Remove-Item -LiteralPath "push_v3.74.524.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.525"') {
    Write-Host "+ 3.74.525" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pp = Get-Content -LiteralPath "app/payments/page.tsx" -Raw

# Guard 1: standalone currency dropdown must be GONE from the correction modal
$curDropdownHits = ([regex]::Matches($pp, [regex]::Escape('correctionFields.original_currency'))).Count
# It should still appear a few times (state + auto-sync), but the 27-option
# dropdown wall should be gone. Detect by looking for the exact old label pair.
if ($pp -match 'Currency'' : ''العُملَة''\s*}</Label>\s*<select[^>]*value=\{correctionFields\.original_currency\}') {
    Write-Host "X standalone currency dropdown still present" -ForegroundColor Red
    exit 1
}
Write-Host "+ standalone currency dropdown removed" -ForegroundColor Green

# Guard 2: account onChange must auto-sync currency + rate
if ($pp -notmatch 'Auto-sync currency to the account') {
    Write-Host "X account onChange missing auto-sync" -ForegroundColor Red
    exit 1
}
Write-Host "+ account auto-syncs currency" -ForegroundColor Green

# Guard 3: ExchangeRateSelector must be used in the correction modal
# (there are already two uses in the create forms; require at least three now)
$erHits = ([regex]::Matches($pp, [regex]::Escape('<ExchangeRateSelector'))).Count
if ($erHits -lt 3) {
    Write-Host "X ExchangeRateSelector not used in correction modal (found $erHits)" -ForegroundColor Red
    exit 1
}
Write-Host "+ ExchangeRateSelector wired into correction modal ($erHits total uses)" -ForegroundColor Green

# Guard 4: method must filter by account type in correction modal
if ($pp -notmatch 'isCashAccount\(correctionFields\.account_id \|\| correctionPayment\.account_id') {
    Write-Host "X method dropdown not filtered by account type in correction modal" -ForegroundColor Red
    exit 1
}
Write-Host "+ method filters by account type" -ForegroundColor Green

# Guard 5: reference only for transfer/check
if ($pp -notmatch 'correctionFields\.payment_method === ''transfer'' \|\| correctionFields\.payment_method === ''check''') {
    Write-Host "X reference not gated on transfer/check" -ForegroundColor Red
    exit 1
}
Write-Host "+ reference gated on transfer/check" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_525.txt"
    $msgLines = @(
        'feat(payments): v3.74.525 - correction modal matches create-payment form UX',
        '',
        'Owner rejected v3.74.524 correction modal because the 27-option',
        'currency dropdown listed all currencies inline as a wall of text,',
        'and the modal did not behave like the create-payment form the',
        'same accountant uses every day. Owner asked for the modal to',
        'work the same as "pay supplier" on the payments page.',
        '',
        'Rebuilt the "Proposed changes" section using the v3.74.516',
        'pattern:',
        '  - Account is the top field and drives everything else.',
        '  - Selecting an account auto-syncs the payment currency and',
        '    clears the rate when the account currency = base.',
        '  - Amount input shows an inline currency badge (no separate',
        '    dropdown).',
        '  - Method dropdown filters cash-only accounts (hides transfer',
        '    / check via isCashAccount).',
        '  - Reference number renders only for transfer / check.',
        '  - ExchangeRateSelector (API dropdown + manual override) shows',
        '    only when effective currency != base.',
        '  - Amber banner if the account currency does not match the',
        '    effective currency.',
        '',
        'Server (resubmit-after-reject) is unchanged from v3.74.524 -',
        'it already accepts original_currency + exchange_rate and',
        're-derives the base_currency_amount triple.',
        '',
        'Files',
        '  app/payments/page.tsx (correction modal rewrite)',
        '  supabase/migrations/20260703000525_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.525'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.525 pushed - correction UX now mirrors create-payment form" -ForegroundColor Green
}
