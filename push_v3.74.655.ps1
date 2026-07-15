$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.654.ps1") { Remove-Item -LiteralPath "push_v3.74.654.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.655"') {
    Write-Host "+ 3.74.655" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.655]")) { Write-Host "X CHANGELOG missing [3.74.655]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "lib/company-scope-guard.ts")) { Write-Host "X helper lib/company-scope-guard.ts missing" -ForegroundColor Red; exit 1 }
$hits = 0
foreach ($f in @("app/api/payments/route.ts","app/api/invoices/route.ts","app/api/sales-orders/route.ts","app/api/bookings/route.ts","app/api/purchase-orders/route.ts")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match "company-scope-guard") { $hits++ } else { Write-Host "X $f not wired" -ForegroundColor Red }
}
if ($hits -lt 5) { Write-Host "X only $hits/5 routes wired" -ForegroundColor Red; exit 1 }
Write-Host "+ cross-company guard wired into 5 high-risk write routes" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "lib/company-scope-guard.ts" `
    "app/api/payments/route.ts" `
    "app/api/invoices/route.ts" `
    "app/api/sales-orders/route.ts" `
    "app/api/bookings/route.ts" `
    "app/api/purchase-orders/route.ts" `
    "push_v3.74.655.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.654.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_655.txt"
    $msgLines = @(
        'feat(security): v3.74.655 - central cross-company reference guard',
        '',
        '- lib/company-scope-guard.ts: findForeignCompanyIds / assertIdsBelongToCompany',
        '  verify submitted entity ids belong to the active company (fail-closed).',
        '- Wired into the high-risk write endpoints: payments (account/customer/invoice),',
        '  invoices (customer), sales-orders (customer), bookings (service/customer),',
        '  purchase-orders (supplier/product/tax_code). Products already covered.',
        '- Prevents multi-company users from submitting another company''s ids.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.655 pushed - cross-company references blocked on key write paths" -ForegroundColor Green
}
