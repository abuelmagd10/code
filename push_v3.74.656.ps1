$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.655.ps1") { Remove-Item -LiteralPath "push_v3.74.655.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.656"') {
    Write-Host "+ 3.74.656" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.656]")) { Write-Host "X CHANGELOG missing [3.74.656]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
if ($bf -notmatch "CustomerFormDialog" -or $bf -notmatch "handleCustomerCreated") { Write-Host "X booking inline-customer wiring missing" -ForegroundColor Red; exit 1 }
$np = Get-Content -LiteralPath "app/bookings/new/page.tsx" -Raw
if ($np -notmatch "reloadCustomers") { Write-Host "X page reloadCustomers missing" -ForegroundColor Red; exit 1 }
Write-Host "+ New Booking page can add a customer inline via the shared dialog" -ForegroundColor Green

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
    "components/bookings/BookingForm.tsx" `
    "app/bookings/new/page.tsx" `
    "push_v3.74.656.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.655.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_656.txt"
    $msgLines = @(
        'feat(bookings): v3.74.656 - add a customer inline from the New Booking page',
        '',
        '- BookingForm gets a "New customer" button that opens the shared',
        '  CustomerFormDialog (same one used on the customers page); on save the',
        '  customer list refreshes and the new customer is auto-selected.',
        '- new/page.tsx extracts reloadCustomers() (respecting role governance) and',
        '  passes it to the form. No duplicate customer-create logic.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.656 pushed - inline new-customer on New Booking" -ForegroundColor Green
}
