$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.305.ps1") { Remove-Item -LiteralPath "push_v3.74.305.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.306"') {
    Write-Host "+ 3.74.306" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# الواجهة: شلنا الـ auto-default
$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -match 'اختَر افتراضياً أول حساب بنكي إن وُجِد') {
    Write-Host "X invoice page still auto-defaults the payment account" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'v3\.74\.306 — لا نختار حساب افتراضياً') {
    Write-Host "X invoice page missing v3.74.306 marker comment" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice page: auto-default removed" -ForegroundColor Green

# الـ API route: defense-in-depth
$route = Get-Content -LiteralPath "app/api/invoices/[id]/record-payment/route.ts" -Raw
foreach ($n in @('ERR_ACCOUNT_REQUIRED','rawAccountId','اختيار حساب النقد/البنك مطلوب')) {
    if ($route -notmatch [regex]::Escape($n)) {
        Write-Host "X record-payment route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ record-payment route: rejects null accountId" -ForegroundColor Green

# الـ service: ownership + cash/bank check
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-payment-command.service.ts" -Raw
foreach ($n in @(
    'ERR_ACCOUNT_NOT_FOUND',
    'ERR_ACCOUNT_FOREIGN_COMPANY',
    'ERR_ACCOUNT_INACTIVE',
    'ERR_ACCOUNT_NOT_CASH_OR_BANK',
    'اختيار حساب النقد/البنك مطلوب لتسجيل الدفعة'
)) {
    if ($svc -notmatch [regex]::Escape($n)) {
        Write-Host "X payment service missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ payment service: ownership + cash/bank validation wired" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_306.txt"
    $msgLines = @(
        'fix(payments): v3.74.306 - close "payment without account" gap on invoices',
        '',
        'On INV-00006 (Test Company / Nasr City branch) the owner noticed a',
        'payment had been recorded "without selecting an account". The',
        'record was actually attached to "حساب بنكي - بنك قناة السويس",',
        'but the user never picked that account — the invoice page was',
        'auto-filling the cash/bank dropdown on dialog open and the user',
        'closed the modal trusting the field was empty. Worse, the',
        'auto-pick was the first bank in the list, which in this case was',
        'a USD account on an EGP invoice.',
        '',
        'Three-layer fix so this can never happen again:',
        '',
        '1) Frontend (app/invoices/[id]/page.tsx)',
        '   Removed the auto-default that picked the first bank account',
        '   when the payment dialog opened. The dropdown now stays on',
        '   "اختر الحساب" until the user makes a conscious choice. The',
        '   submit button is already disabled while paymentAccountId is',
        '   falsy, so this is the safest UX.',
        '',
        '2) API route (app/api/invoices/[id]/record-payment)',
        '   Added an explicit pre-check that returns 400',
        '   ERR_ACCOUNT_REQUIRED when accountId is missing or blank.',
        '   Closes the door on direct API calls (curl, integrations) that',
        '   could previously slip through the frontend.',
        '',
        '3) Command service (sales-invoice-payment-command.service.ts)',
        '   Final line of defense at the orchestration layer:',
        '     * accountId presence check (ERR_ACCOUNT_REQUIRED)',
        '     * the account row must exist (ERR_ACCOUNT_NOT_FOUND)',
        '     * it must belong to the same company',
        '       (ERR_ACCOUNT_FOREIGN_COMPANY — blocks cross-tenant abuse)',
        '     * it must not be archived / inactive (ERR_ACCOUNT_INACTIVE)',
        '     * sub_type or account name must read as cash or bank',
        '       (ERR_ACCOUNT_NOT_CASH_OR_BANK — blocks routing payments',
        '        to revenue / expense / equity accounts by mistake)',
        '',
        'No DB migration. The payments.account_id column stays nullable',
        'because of historical refund / void rows, but the write path can',
        'no longer create new rows with a null account.',
        '',
        'Files',
        '  app/invoices/[id]/page.tsx',
        '  app/api/invoices/[id]/record-payment/route.ts',
        '  lib/services/sales-invoice-payment-command.service.ts',
        '  lib/version.ts -> 3.74.306'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.306 pushed" -ForegroundColor Green
}
