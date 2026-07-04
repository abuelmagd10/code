$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.528"') {
    Write-Host "+ 3.74.528" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw

# Customer refund interface + loader + card
foreach ($needle in @(
    'refund_account_name: string \| null',
    'from\("customer_refund_requests"\)',
    'refund_method, refund_account_id, rejection_reason',
    'refund_account_name: r\.refund_account_id',
    'Refund amount"\)\}: \{fmtMoney\(r\.amount\)\} \{r\.currency\}'
)) {
    if ($ap -notmatch $needle) { Write-Host "X customer refund: $needle" -ForegroundColor Red; exit 1 }
}
Write-Host "+ customer refund card enriched" -ForegroundColor Green

# Vendor correction interface + loader + card
foreach ($needle in @(
    'currency: string\s+base_amount: number \| null',
    'from\("vendor_payment_correction_requests"\)',
    'original_payment_id',
    'Correction amount"\)\}: \{fmtMoney\(r\.amount\)\} \{r\.currency\}'
)) {
    if ($ap -notmatch $needle) { Write-Host "X vendor correction: $needle" -ForegroundColor Red; exit 1 }
}
Write-Host "+ vendor correction card enriched" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_528.txt"
    $msgLines = @(
        'feat(approvals): v3.74.528 - enrich customer refund + vendor payment correction cards',
        '',
        'Sales-side / cross-side audit for the same class of bug the',
        'supplier payment card had before v3.74.521-527. Findings:',
        '',
        '  * Sales returns math on invoices/[id]/page.tsx is clean',
        '    (netDueAmount subtracts returned_amount at line 2540-42).',
        '    No fix.',
        '  * Customer refund card in /approvals said "qeemat al-istirdad:',
        '    0.00" with NO currency label. Refund row DB carries currency,',
        '    exchange_rate, base_amount, refund_method, refund_account_id,',
        '    rejection_reason - loader was pulling none of them.',
        '  * Vendor payment correction card had the same class of bug.',
        '    Currency + FX live on the ORIGINAL payment referenced by',
        '    original_payment_id, not on the correction row.',
        '',
        'Fixes (approvals/page.tsx only):',
        '',
        '  Customer refund: interface + loader + card get currency, FX,',
        '  method, destination account (chart_of_accounts batch),',
        '  requester email (company_members batch), rejection reason',
        '  banner (previous reject), notes in amber callout.',
        '',
        '  Vendor correction: interface + loader + card get currency,',
        '  base_amount, exchange_rate joined from payments via',
        '  original_payment_id, requester email, rejection reason.',
        '  Method + account are omitted (corrections are reversals,',
        '  not fresh transfers).',
        '',
        'Files',
        '  app/approvals/page.tsx (2 interfaces, 2 loaders, 2 cards)',
        '  supabase/migrations/20260703000528_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.528'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.528 pushed - refund + correction cards honest about currency" -ForegroundColor Green
}
