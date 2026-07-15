$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.645.ps1") { Remove-Item -LiteralPath "push_v3.74.645.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.646"') {
    Write-Host "+ 3.74.646" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$flt = Get-Content -LiteralPath "components/bookings/BookingsFilters.tsx" -Raw
if ($flt -notmatch "branchId" -or $flt -notmatch "All Branches") { Write-Host "X branch filter UI missing" -ForegroundColor Red; exit 1 }
$pg = Get-Content -LiteralPath "app/bookings/page.tsx" -Raw
if ($pg -notmatch "setBranches" -or $pg -notmatch 'params.set\("branch_id"') { Write-Host "X page branch wiring missing" -ForegroundColor Red; exit 1 }
$api = Get-Content -LiteralPath "app/api/bookings/route.ts" -Raw
if ($api -notmatch "branchId && isCompanyWide") { Write-Host "X API branch filter fix missing" -ForegroundColor Red; exit 1 }
Write-Host "+ bookings branch filter wired (UI + page + API, role-aware)" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

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
    "components/bookings/BookingsFilters.tsx" `
    "app/bookings/page.tsx" `
    "app/api/bookings/route.ts" `
    "push_v3.74.646.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.645.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_646.txt"
    $msgLines = @(
        'feat(bookings): v3.74.646 - branch filter on the bookings page',
        '',
        '- BookingsFilters gains a Branch dropdown (shown only when >1 branch).',
        '- Page loads branches for company-wide roles (owner/admin/general_manager)',
        '  only and sends branch_id; branch-scoped users stay locked to their branch.',
        '- API: company-wide roles can now filter by any branch even if their own',
        '  membership row carries a branch_id.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.646 pushed - bookings branch filter" -ForegroundColor Green
}
