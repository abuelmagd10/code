# v3.74.42 - branch-scope 9 more account-picker forms
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.42"') {
    Write-Host "+ APP_VERSION = 3.74.42" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.42" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.42]')) {
    Write-Host "+ CHANGELOG 3.74.42" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.42" -ForegroundColor Red; exit 1 }

# v3.74.42 marker check on every fixed file
$files = @(
    'app/bills/page.tsx',
    'app/bills/[id]/page.tsx',
    'app/purchase-returns/new/page.tsx',
    'app/drawings/new/page.tsx',
    'app/hr/payroll/page.tsx',
    'app/hr/instant-payouts/page.tsx',
    'components/commissions/run-payment-dialog.tsx',
    'components/fixed-assets/dispose-asset-dialog.tsx',
    'components/fixed-assets/add-capital-dialog.tsx'
)
foreach ($f in $files) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'v3\.74\.42') {
        Write-Host "  + $f" -ForegroundColor Green
    } else { Write-Host "  X $f missing v3.74.42 marker" -ForegroundColor Red; exit 1 }
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
    git commit -m "fix(governance): v3.74.42 - branch-scope 9 more account-picker forms

Pre-launch sweep extending the v3.74.41 fix pattern to every other
cash/bank account dropdown in the app. Sub-agent audited app/ and
components/ for chart_of_accounts queries feeding UI pickers and
flagged 9 with the same governance gap (plus 2 of those had a wrong-
column-name bug on top).

Branch-scope pattern applied uniformly: owner/admin/general_manager
see every company cash + bank account; everyone else sees ONLY their
branch's accounts (no central-treasury fallback).

Files:
- app/bills/page.tsx (purchase-return refund picker)
- app/bills/[id]/page.tsx
- app/purchase-returns/new/page.tsx
- app/drawings/new/page.tsx
- app/hr/payroll/page.tsx
- app/hr/instant-payouts/page.tsx
- components/commissions/run-payment-dialog.tsx
- components/fixed-assets/dispose-asset-dialog.tsx
- components/fixed-assets/add-capital-dialog.tsx
  (also fixed an empty-dropdown bug here - was filtering on
  account_type IN ('cash','bank','liability') which never matched
  anything; switched to sub_type IN ('cash','bank'))

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.42 pushed" -ForegroundColor Green
}
