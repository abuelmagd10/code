$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.363.ps1") { Remove-Item -LiteralPath "push_v3.74.363.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.364"') {
    Write-Host "+ 3.74.364" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'v3.74.364 — match the /sales-orders filter UX',
    'import { FilterContainer }',
    'import { MultiSelect }',
    'const [filterStatuses,  setFilterStatuses]',
    'const [filterCustomers, setFilterCustomers]',
    'const [filterServices,  setFilterServices]',
    'const [filterStaff,     setFilterStaff]',
    'const [filterBranches,  setFilterBranches]',
    'v3.74.364 — full filter pipeline',
    'v3.74.364 — Filter container mirrors /sales-orders'
)) {
    if ($bt -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: FilterContainer + MultiSelect filters" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_364.txt"
    $msgLines = @(
        'feat(bookings): v3.74.364 - bookings tab matches /sales-orders filter UX',
        '',
        'Owner asked for the bookings tab inside /sales-orders to use',
        'the same FilterContainer + MultiSelect layout the main sales',
        'orders tab has, instead of the tiny single-row strip.',
        '',
        'Filters added',
        '  * Search (booking no / customer / service) - text input',
        '  * Status         - multi-select (Draft / Executed / Cancelled)',
        '  * Customer       - multi-select',
        '  * Service        - multi-select',
        '  * Staff          - multi-select (matches assigned_staff_user_ids',
        '                     OR the legacy staff_user_id fallback)',
        '  * Branch         - multi-select, visible only for owner /',
        '                     general_manager (company-scope)',
        '  * From / To date - bounded server-side via /api/bookings',
        '                     date_from / date_to query params',
        '',
        'Other touches',
        '  - FilterContainer surface with collapsible activeCount badge',
        '    and a "مسح الفلاتر" reset that wipes everything in one click.',
        '  - Refresh button moved next to the "حجز جديد" CTA.',
        '  - filtered result count shown under the filter bar when any',
        '    filter is active.',
        '',
        'Files',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.364'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.364 pushed" -ForegroundColor Green
}
