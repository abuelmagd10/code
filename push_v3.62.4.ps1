# v3.62.4 - dashboard AR widget shows customer credit correctly
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "components/DashboardSecondaryStats.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.4"') { Write-Host "  + APP_VERSION = 3.62.4" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.4" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "components/DashboardSecondaryStats.tsx" -Raw
if ($page -match 'Math\.max\(0, glReceivables\)' -and $page -match 'ائتمان للعملاء') {
    Write-Host "  + AR widget clamped + customer credit sub-line" -ForegroundColor Green
} else { Write-Host "  X AR widget fix incomplete" -ForegroundColor Red; exit 1 }
if ($page -match 'Math\.max\(0, glPayables\)' -and $page -match 'سُلَف للموردين') {
    Write-Host "  + AP widget clamped + supplier advance sub-line" -ForegroundColor Green
} else { Write-Host "  X AP widget fix incomplete" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts components/DashboardSecondaryStats.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(dashboard): v3.62.4 - AR widget correctly classifies customer credit

E2E testing exposed 'ذمم مدينة: -0.68 ج.م' on the dashboard.
The number was accounting-correct (customer paid 10.68 EGP against a
10 EGP invoice because of USD->EGP conversion) but the LABEL was
wrong - that's a customer credit, not a receivable.

The /customers page already classified it correctly. This commit makes
the dashboard widget mirror that:

  - AR card now displays max(0, glReceivables) - never negative
  - When glReceivables < 0, a purple sub-line shows:
      'ائتمان للعملاء: |amount|' (Customer credit: |amount|)
  - Same treatment for AP (supplier advance when negative)
  - 'All settled' message now triggers on <= 0 instead of == 0

No behavioural change for the positive-balance common case.

Files:
  Modified: components/DashboardSecondaryStats.tsx
  Modified: lib/version.ts (3.62.3 -> 3.62.4)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.4 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Reload /dashboard - 'ذمم مدينة' should now show 0" -ForegroundColor White
    Write-Host "  2. Under it, a purple line: 'ائتمان للعملاء: 0.68 ج.م'" -ForegroundColor White
    Write-Host "  3. Hover the line for tooltip explaining FX residual" -ForegroundColor White
}
