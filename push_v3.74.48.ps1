# v3.74.48 - DB-level guard against negative per-branch inventory
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.48"') {
    Write-Host "+ APP_VERSION = 3.74.48" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.48" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.48]')) {
    Write-Host "+ CHANGELOG 3.74.48" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.48" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(inventory): v3.74.48 - DB-level guard against negative per-branch inventory + correction transfer

Right after enabling V2 in v3.74.47, the VitaSlims audit re-ran and
found per-branch holdings were skewed:
  مدينة نصر:   -3 (negative)
  الرئيسي:    +5
  Total:      +2 (correct in aggregate, wrong per branch)

History: 5 units were transferred from مدينة نصر to الرئيسي, then
4 units were sold FROM مدينة نصر afterwards. مدينة نصر's balance was
already zero at that point, but the invoice flow accepted the sales
anyway. There was no DB-level check.

This is a real governance gap: any tracked product could be over-sold
from a branch drained by a prior transfer.

Fix - new BEFORE INSERT trigger on inventory_transactions:
- prevent_negative_branch_inventory() raises check_violation with a
  bilingual AR/EN message if a new outgoing movement would push the
  per-branch balance below zero.
- Skips: incoming movements, NULL branch_id, non-tracked products
  (products.track_inventory = false).
- Locks products.id row to serialize concurrent oversell attempts.
- Covers sale_dispatch, transfer_out, production_issue automatically.

Data correction - manual transfer TRF-CORR-001:
  3 transfer_out from الرئيسي
  3 transfer_in to مدينة نصر
Result:
  مدينة نصر:   0
  الرئيسي:    +2
  Total:       +2 (unchanged)

Test: injected -10 oversell from مدينة نصر while balance=0; trigger
raised check_violation, no row added. A normal -1 deduction from
الرئيسي (balance=2) passes cleanly.

The fix sits at the lowest layer, so it catches all current and
future entry points: invoice posting, warehouse-approval V2 dispatch,
manual transfers, production issues.

The 4 legacy sales that originally drove مدينة نصر negative remain
without COGS. The correction transfer brings the branch back to zero
without rewriting their history; backfilling their COGS is a separate
small migration tracked for later.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.48 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.47.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.47.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.47.ps1)" -ForegroundColor DarkGray
    }
}
