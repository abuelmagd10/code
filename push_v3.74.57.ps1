# v3.74.57 - useAutoRefresh wave 2: +11 pages
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.57"') {
    Write-Host "+ APP_VERSION = 3.74.57" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.57" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.57]')) {
    Write-Host "+ CHANGELOG 3.74.57" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.57" -ForegroundColor Red; exit 1 }

$wave2 = @(
    'app/journal-entries/page.tsx',
    'app/payments/page.tsx',
    'app/drawings/page.tsx',
    'app/purchase-orders/page.tsx',
    'app/sales-returns/page.tsx',
    'app/purchase-returns/page.tsx',
    'app/inventory/write-offs/page.tsx',
    'app/inventory/dispatch-approvals/page.tsx',
    'app/services/page.tsx',
    'app/bookings/page.tsx',
    'app/customer-debit-notes/page.tsx'
)
foreach ($p in $wave2) {
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -match 'useAutoRefresh' -and $c -match 'use-auto-refresh') {
        Write-Host "  + $p" -ForegroundColor Green
    } else { Write-Host "  X $p missing hook" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(ux): v3.74.57 - useAutoRefresh wave 2 (+11 pages)

v3.74.56 introduced useAutoRefresh and applied it to the 15
highest-traffic pages. This wave extends coverage to the next
tier - daily-use accounting, purchasing, and operations - bringing
the pilot total to 26 pages.

Pages added:
- journal-entries (loadEntries)
- payments (reloadPaymentsWithFilters)
- drawings (loadDrawings)
- purchase-orders (fetchOrders, wrapped with currentPage+pageSize
  so pagination state stays consistent)
- sales-returns (loadReturnsData)
- purchase-returns (loadReturns)
- inventory/write-offs (loadData)
- inventory/dispatch-approvals (loadAll) - already uses realtime,
  auto-refresh is a harmless second layer via the 5s throttle
- services (loadServices)
- bookings (loadBookings)
- customer-debit-notes (loadData - async function declaration form)

The Python migrator grew to handle three function-definition shapes:
const X = async (...), const X = useCallback(async (...)), and
async function X(...). Each page got the same two-line addition:
one import + one hook call before the load-function definition.

Coverage: 26 of about 200 pages. Still a small minority by count
but covers the lion's share of daily user traffic. Remaining waves
target HR, manufacturing, the reports family, settings, banking
sub-pages.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.57 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.56.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.56.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.56.ps1)" -ForegroundColor DarkGray
    }
}
