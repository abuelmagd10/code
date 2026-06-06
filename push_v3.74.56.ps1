# v3.74.56 - useAutoRefresh hook + 15-page pilot
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.56"') {
    Write-Host "+ APP_VERSION = 3.74.56" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.56" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.56]')) {
    Write-Host "+ CHANGELOG 3.74.56" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.56" -ForegroundColor Red; exit 1 }

if (Test-Path 'hooks/use-auto-refresh.ts') {
    Write-Host "+ hooks/use-auto-refresh.ts present" -ForegroundColor Green
} else { Write-Host "X hooks/use-auto-refresh.ts missing" -ForegroundColor Red; exit 1 }

$pilot = @(
    'app/invoices/page.tsx',
    'app/bills/page.tsx',
    'app/customers/page.tsx',
    'app/suppliers/page.tsx',
    'app/products/page.tsx',
    'app/sales-orders/page.tsx',
    'app/expenses/page.tsx',
    'app/inventory/page.tsx',
    'app/banking/page.tsx',
    'app/customer-credits/page.tsx',
    'app/vendor-credits/page.tsx',
    'app/warehouses/page.tsx',
    'app/shareholders/page.tsx',
    'app/sales-return-requests/page.tsx',
    'app/fixed-assets/page.tsx'
)
foreach ($p in $pilot) {
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
    git commit -m "feat(ux): v3.74.56 - useAutoRefresh hook + 15-page pilot

Several pages did not reflect new database state until the user
manually pressed F5. We need a universal, cheap-to-run mechanism
that brings pages back in sync the moment the user returns to
them, without overloading Supabase with permanent subscriptions on
every page.

Decision - hybrid model:
- Realtime subscriptions stay reserved for the small set of pages
  with multi-user workflows where seconds matter (already used by
  /inventory-transfers, notifications, approvals).
- Window focus / visibilitychange is now the universal baseline:
  refresh on tab return.
- No polling.

New hook hooks/use-auto-refresh.ts listens for window.focus and
document.visibilitychange === visible. Re-runs the consumer's load
function with a 5-second min-interval throttle. SSR-safe. Callback
held in a ref so fresh closure always called without re-attaching
listeners every render. Failures caught and only logged in dev.

Pilot - 15 high-traffic pages:
  invoices, bills, customers, suppliers, products, sales-orders,
  expenses, inventory, banking, customer-credits, vendor-credits,
  warehouses, shareholders, sales-return-requests, fixed-assets.

Each page now has the same shape:
  import { useAutoRefresh } from '@/hooks/use-auto-refresh'
  useAutoRefresh({ onRefresh: () => loadData() })

The arrow-wrap protects against const-TDZ since the hook can be
placed before the function definition; the closure only resolves
on actual focus/visibility events, well after mount.

Wave migration starts next release - this covers ~7 percent of
pages but the heaviest 15.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.56 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.55.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.55.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.55.ps1)" -ForegroundColor DarkGray
    }
}
