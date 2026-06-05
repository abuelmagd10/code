# v3.74.53 - fallback governance for transfer dispatch & receipt
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.53"') {
    Write-Host "+ APP_VERSION = 3.74.53" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.53" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.53]')) {
    Write-Host "+ CHANGELOG 3.74.53" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.53" -ForegroundColor Red; exit 1 }

$det = Get-Content -LiteralPath "app/inventory-transfers/[id]/page.tsx" -Raw
if ($det -match 'v3\.74\.53') {
    Write-Host "+ v3.74.53 marker present in detail page" -ForegroundColor Green
} else { Write-Host "X v3.74.53 marker missing in detail page" -ForegroundColor Red; exit 1 }
if ($det -match 'sourceWarehouseHasManager' -and $det -match 'destinationWarehouseHasManager') {
    Write-Host "+ has-manager flags present" -ForegroundColor Green
} else { Write-Host "X has-manager flags missing" -ForegroundColor Red; exit 1 }
if ($det -match 'canManageStartFallback' -and $det -match 'canManageReceiveFallback') {
    Write-Host "+ fallback derivations present" -ForegroundColor Green
} else { Write-Host "X fallback derivations missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(inventory-transfers): v3.74.53 - fallback governance for dispatch & receipt

After v3.74.51 closed the dispatch handoff, the Start Transfer button
still showed for every owner/admin/manager/GM. The moment management
approved the request, they could keep clicking and dispatch the goods
themselves, racing past the store_manager who had just been notified
to do that job.

Same shape on receipt: Approve Receipt was gated to the destination
store_manager only, but if a warehouse had no store_manager assigned
(realistic for small operations), goods that landed there could never
be marked received.

Fix - management acts only when no store_manager exists for the
relevant warehouse:

- Added sourceWarehouseHasManager / destinationWarehouseHasManager
  boolean|null state. null = loading, buttons stay hidden.
- New effect on transfer + companyId counts company_members where
  role='store_manager' AND warehouse_id AND branch_id match each
  side, then sets each flag.
- canStartDispatch now = (isSourceWarehouseManager ||
  (canManage && sourceWarehouseHasManager === false)) && status =
  pending.
- canReceive now = (isDestinationWarehouseManager ||
  (canManage && destinationWarehouseHasManager === false)). Previously
  the destination side had no management path at all; this also fixes
  unreceivable transfers when destination has no store_manager.
- Lookup error falls back to true on both flags - safer default that
  hides the management button.

Files changed:
- app/inventory-transfers/[id]/page.tsx
- lib/version.ts (APP_VERSION = 3.74.53)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.53 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.52.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.52.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.52.ps1)" -ForegroundColor DarkGray
    }
}
