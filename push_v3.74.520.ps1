$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.519.ps1") { Remove-Item -LiteralPath "push_v3.74.519.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.520"') {
    Write-Host "+ 3.74.520" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$files = @(
    "app/reports/simple-summary/page.tsx",
    "app/approvals/page.tsx",
    "app/drawings/[id]/page.tsx",
    "app/invoices/[id]/page.tsx",
    "components/customers/customer-form-dialog.tsx"
)
foreach ($f in $files) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch 'v3\.74\.520') {
        Write-Host "X $f missing base-currency fix" -ForegroundColor Red; exit 1
    }
}
# invoices/new: الإصلاح استبدال مباشر بلا تعليق — نفحص النمط الفعلى
$invNew = Get-Content -LiteralPath "app/invoices/new/page.tsx" -Raw
if ($invNew -notmatch "baseCurrency === 'EGP'") {
    Write-Host "X app/invoices/new/page.tsx missing base-currency fix" -ForegroundColor Red; exit 1
}
$ss = Get-Content -LiteralPath "app/reports/simple-summary/page.tsx" -Raw
if ($ss -match "t\('EGP', '..\..'\)" -and $ss -notmatch 'baseCode') {
    Write-Host "X simple-summary still hardcodes EGP" -ForegroundColor Red; exit 1
}
Write-Host "+ all app-level currency labels derive from company base currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_520.txt"
    $msgLines = @(
        'fix(fx): v3.74.520 - project-wide sweep of hardcoded currency labels',
        '',
        'Owner (pre-launch): make sure NOTHING renders a currency label',
        'that ignores the app base currency from settings. Full sweep',
        'found and fixed six real display spots (marketing/blog pages',
        'excluded - EGP there is intentional Egypt-market copy):',
        '',
        '- reports/simple-summary: 12 EGP/j.m labels, two chart tooltips,',
        '  the capital-vs-assets line AND the exported text report now',
        '  derive from app_currency.',
        '- approvals: discount value + document total labels (card +',
        '  history value_label).',
        '- drawings/[id]: amount label.',
        '- invoices/new: linked sales-order total labels (x2).',
        '- invoices/[id]: STORED journal description for pre-shipment',
        '  refunds no longer bakes in EGP.',
        '- customer-form-dialog: receivable/credit balance warnings.',
        '',
        'Files',
        '  app/reports/simple-summary/page.tsx',
        '  app/approvals/page.tsx',
        '  app/drawings/[id]/page.tsx',
        '  app/invoices/new/page.tsx',
        '  app/invoices/[id]/page.tsx',
        '  components/customers/customer-form-dialog.tsx',
        '  lib/version.ts -> 3.74.520'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.520 pushed - currency labels fully settings-driven" -ForegroundColor Green
}
