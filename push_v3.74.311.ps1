$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.310.ps1") { Remove-Item -LiteralPath "push_v3.74.310.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.311"') {
    Write-Host "+ 3.74.311" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ep = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts" -Raw

# الـ select لازم يجيب detailed_address
if ($ep -notmatch '\.select\("name, phone, address, detailed_address, city, governorate, country"\)') {
    Write-Host "X customer select missing detailed_address/governorate" -ForegroundColor Red; exit 1
}
# لازم نستخدم consigneeAddress fallback
if ($ep -notmatch 'consigneeAddress: string') {
    Write-Host "X consigneeAddress fallback variable missing" -ForegroundColor Red; exit 1
}
# الـ payload لـ Bosta يستخدم consigneeAddress
if ($ep -notmatch 'address: consigneeAddress') {
    Write-Host "X Bosta payload not using consigneeAddress" -ForegroundColor Red; exit 1
}
if ($ep -notmatch 'v3\.74\.311 — read detailed_address') {
    Write-Host "X v3.74.311 marker comment missing" -ForegroundColor Red; exit 1
}
Write-Host "+ approve+shipping route: reads detailed_address (UI field)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_311.txt"
    $msgLines = @(
        'fix(shipping): v3.74.311 - read detailed_address (the actual UI field)',
        '',
        'Owner reported that "اعتماد + إرسال لـ bosta" rejected a customer',
        'whose details looked complete in the customers page. After',
        'v3.74.310 surfaced the real error, the failure dialog now said',
        '"العنوان التفصيلى ناقص" — and the customer page CLEARLY had a',
        'detailed address typed in. Confusion on the surface only.',
        '',
        'Root cause: the customers table on this project has two address',
        'columns — `address` (legacy, no longer populated by the form)',
        'and `detailed_address` (the field labelled "العنوان التفصيلى"',
        'in the UI). My v3.74.305 select only read `address`, so for',
        'every customer added through the current form, the route read',
        'an empty string and treated the customer as incomplete.',
        '',
        'Fix',
        '  Pull both columns in the select. Build the consignee address',
        '  with detailed_address first, falling back to the legacy',
        '  address column for older records that only have that one.',
        '  The validation and the Bosta payload now use the resolved',
        '  address, so a customer with a populated detailed_address goes',
        '  through cleanly.',
        '',
        'No DB migration. detailed_address has been on customers for',
        'a long time — this is purely a read-side fix on the new route.',
        '',
        'Files',
        '  app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts',
        '  lib/version.ts -> 3.74.311'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.311 pushed" -ForegroundColor Green
}
