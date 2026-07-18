$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.700.ps1") { Remove-Item -LiteralPath "push_v3.74.700.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.701"') {
    Write-Host "+ 3.74.701" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.701]")) { Write-Host "X CHANGELOG missing [3.74.701]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The sale-products picker must be branch-scoped.
$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($ba -notmatch "branch_id\.eq\.\$\{bookingBranchId\},branch_id\.is\.null") {
    Write-Host "X the sale-products picker is not scoped to the booking branch" -ForegroundColor Red; exit 1
}
Write-Host "+ sale-products picker scoped to the booking branch" -ForegroundColor Green

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
    "components/bookings/BookingAddons.tsx" `
    "push_v3.74.701.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.700.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_701.txt"
    $msgLines = @(
        'fix(governance): v3.74.701 - scope the booking sale-products picker to the branch',
        '',
        '- The picker listed every product in the company, so an executor could add',
        '  another branch product as a sale item. Nothing blocked it until',
        '  execution, where validate_product_branch_isolation aborted the whole',
        '  activation after all approvals had been completed.',
        '- The picker is now limited to the booking branch (plus company-wide',
        '  products with no branch). The database guard remains the last line.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.701 pushed - branch-scoped sale products in bookings" -ForegroundColor Green
}
