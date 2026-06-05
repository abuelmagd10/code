# v3.74.47 - enable warehouse approval V2 (fix silently-skipped COGS + FIFO) + cleanup VitaSlims orphans
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.47"') {
    Write-Host "+ APP_VERSION = 3.74.47" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.47" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.47]')) {
    Write-Host "+ CHANGELOG 3.74.47" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.47" -ForegroundColor Red; exit 1 }

$flags = Get-Content -LiteralPath "lib/enterprise-finance-flags.ts" -Raw
if ($flags -match 'warehouseApprovalV2:\s*readFlag\("ERP_PHASE1_V2_WAREHOUSE_APPROVAL",\s*true\)') {
    Write-Host "+ warehouseApprovalV2 default = true" -ForegroundColor Green
} else { Write-Host "X warehouseApprovalV2 default still false" -ForegroundColor Red; exit 1 }
if ($flags -match 'v3\.74\.47') {
    Write-Host "+ v3.74.47 marker present in flags file" -ForegroundColor Green
} else { Write-Host "X v3.74.47 marker missing in flags file" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(financial): v3.74.47 - enable warehouse approval V2 (was silently skipping COGS + FIFO)

Pre-launch audit of VitaSlims in company تست surfaced that no sale of
a tracked product had ever posted COGS, and the FIFO lot for the only
live purchase had never been consumed. The inventory GL account stayed
at the purchase total, the cost-of-goods-sold account never moved, and
gross profit was being overstated by the full sale value.

Root cause: lib/accounting-transaction-service.ts::approveSalesDelivery
checks enterpriseFinanceFlags.warehouseApprovalV2 to pick between
two RPCs:
  - V1 (approve_sales_delivery): inserts inventory_transactions only.
    Does NOT post COGS journal, does NOT create fifo_lot_consumptions,
    does NOT decrement the inventory account.
  - V2 (approve_sales_delivery_v2): thin wrapper over
    post_accounting_event_v2 that handles all of the above.

The flag was defaulting to false since the v3.27 partial rollout
window, so every production warehouse approval routed to V1. The bug
is system-wide; VitaSlims is just the first product whose testing
caught it.

Fix:
  - Flipped warehouseApprovalV2 default to true in
    lib/enterprise-finance-flags.ts. Env var override still works for
    emergency rollback.
  - V2 was verified safe before flipping: column audit on
    post_accounting_event_v2 returned zero bad references;
    prepareCOGSJournalOnDelivery is present; the inventory (sub_type=
    'inventory') and cogs (sub_type='cogs') accounts both exist in
    the affected company; the TypeScript caller path was traced
    end-to-end.

Bonus DB bug fixed in migrations:
  - prevent_linked_inventory_modification() was returning NEW from a
    DELETE trigger. NEW is NULL during DELETE and returning NULL from a
    BEFORE row trigger cancels the operation. The trigger was therefore
    blocking every delete on inventory_transactions, even ones with no
    posted-journal linkage. Migration v3_74_47b fixes it to return OLD
    on DELETE / NEW on UPDATE.

VitaSlims orphan cleanup (company تست only):
  - 23 inventory_transactions whose referenced purchase bill had been
    hard-deleted in a prior test cleanup.
  - 25 fifo_cost_lots for the same deleted bills.
  - products.quantity_on_hand recomputed: VitaSlims now sits at 2
    units (5 received + 1 returned-in - 4 dispatched).

The 4 existing sales remain without COGS; backfilling them is a
separate task. The new V2 path will handle all future sales correctly.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.47 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.45.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.45.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.45.ps1)" -ForegroundColor DarkGray
    }
}
