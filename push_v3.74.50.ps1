# v3.74.50 - lock destination warehouse on /inventory-transfers edit
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.50"') {
    Write-Host "+ APP_VERSION = 3.74.50" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.50" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.50]')) {
    Write-Host "+ CHANGELOG 3.74.50" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.50" -ForegroundColor Red; exit 1 }

$ed = Get-Content -LiteralPath "app/inventory-transfers/[id]/edit/page.tsx" -Raw
if ($ed -match "v3\.74\.50") {
    Write-Host "+ v3.74.50 marker present in edit page" -ForegroundColor Green
} else { Write-Host "X v3.74.50 marker missing in edit page" -ForegroundColor Red; exit 1 }
if ($ed -match 'canChooseDestination') {
    Write-Host "+ canChooseDestination flag present" -ForegroundColor Green
} else { Write-Host "X canChooseDestination flag missing" -ForegroundColor Red; exit 1 }
if ($ed -match 'disabled=\{!canChooseDestination\}') {
    Write-Host "+ destination Select is disabled when locked" -ForegroundColor Green
} else { Write-Host "X destination Select not disabled" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(inventory-transfers): v3.74.50 - lock destination warehouse on edit for regular roles

The /inventory-transfers/new page already locks the destination
warehouse to the user's branch for non-managerial roles (Pull-model
governance). But the /inventory-transfers/[id]/edit page (used to
re-submit a rejected request) let the destination dropdown be edited
freely - which meant the only role that can reach it (accountant,
who is explicitly excluded from canChooseDestination in /new) could
quietly redirect goods to any warehouse in the company.

Fix: mirror the /new governance in /edit.

- Read role, branch_id, warehouse_id from company_members in loadData;
  store as state.
- canChooseDestination uses the same allowlist as /new (owner, admin,
  manager, general_manager, gm). Accountants and others are excluded.
- A new useEffect (copied from /new) forces destinationWarehouseId to
  the user's branch warehouse, preferring userWarehouseId if it's in
  the branch, otherwise the first non-source warehouse in the branch.
- The destination <Select> is now disabled when locked, with
  onValueChange short-circuited to undefined and a small hint line
  beneath it.
- validateForm now refuses to save when the destination's branch_id
  doesn't match the user's branch, even if someone tampered with the
  control via devtools. Bilingual AR/EN error toast.

/new is untouched - it already had this. This commit brings /edit
to the same standard. The DB-side guard from v3.74.48
(prevent_negative_branch_inventory) is unchanged.

Files changed:
- app/inventory-transfers/[id]/edit/page.tsx
- lib/version.ts (APP_VERSION = 3.74.50)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.50 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.49.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.49.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.49.ps1)" -ForegroundColor DarkGray
    }
}
