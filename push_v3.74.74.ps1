# v3.74.74 - Pre-check shortages للـ warehouse approval + DB RPC + UI plumbing
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path ".git/index.broken") {
    # Index was corrupted earlier in this session — rebuild from HEAD
    Remove-Item ".git/index.broken" -Force
    git read-tree HEAD
    git add -A | Out-Null
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.74"') { Write-Host "+ APP_VERSION = 3.74.74" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.74" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.74]')) { Write-Host "+ CHANGELOG 3.74.74" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.74" -ForegroundColor Red; exit 1 }

# Sanity: each touched file ends with closing brace + intact length
$files = @(
    @{ Path = "lib/accounting-transaction-service.ts"; MinLines = 1020 },
    @{ Path = "lib/services/sales-invoice-warehouse-command.service.ts"; MinLines = 455 },
    @{ Path = "app/api/invoices/[id]/warehouse-approve/route.ts"; MinLines = 75 }
)
foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.Path -Raw
    $lines = ($content -split "`n").Count
    if ($lines -ge $f.MinLines -and $content.TrimEnd().EndsWith("}")) {
        Write-Host "+ $($f.Path) intact ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "X $($f.Path) suspicious ($lines lines, ends '$($content[-3..-1])')" -ForegroundColor Red
        exit 1
    }
}

# Markers from v3.74.74 must all be present
$svc = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
if ($svc -match 'InventoryShortageItem' -and `
    $svc -match 'check_branch_warehouse_stock' -and `
    $svc -match 'shortages\?:') {
    Write-Host "+ accounting-service has all 3 v3.74.74 markers" -ForegroundColor Green
} else { Write-Host "X markers missing in accounting-service" -ForegroundColor Red; exit 1 }

$cmd = Get-Content -LiteralPath "lib/services/sales-invoice-warehouse-command.service.ts" -Raw
if ($cmd -match 'type InventoryShortageItem' -and `
    $cmd -match 'details\?: \{ shortages\?' -and `
    $cmd -match 'shortages: approvalResult.shortages') {
    Write-Host "+ command service has all 3 v3.74.74 markers" -ForegroundColor Green
} else { Write-Host "X markers missing in command service" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve/route.ts" -Raw
if ($route -match 'required_qty: s\.requested' -and `
    $route -match 'available_qty: s\.available') {
    Write-Host "+ route.ts has UI-shape remapping" -ForegroundColor Green
} else { Write-Host "X markers missing in route.ts" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (only v3.74.74 files) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "accounting-transaction-service\.ts|sales-invoice-warehouse-command\.service\.ts|warehouse-approve"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in v3.74.74 files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(dispatch): v3.74.74 - structured shortages UX for warehouse approval

The DB has been safe since v3.74.48 (trg_prevent_negative_branch_inventory
aborts approve_sales_delivery_v2 when the branch+warehouse balance would
go negative). The UX wasn't: the only pre-check in prepareFIFOConsumptionData
looked at fifo_cost_lots company-wide, so a per-branch shortage slipped past
it and surfaced as a raw error toast. Meanwhile dispatch-approvals/page.tsx
already had the rich shortage modal wired for the manufacturing flow.

DB - new RPC check_branch_warehouse_stock(p_company_id, p_branch_id,
p_warehouse_id, p_items) SUMs inventory_transactions filtered by the full
(company, product, branch, warehouse) tuple. Returns {shortages: [...]}
with product_name + uom. STABLE SECURITY DEFINER.

Service (lib/accounting-transaction-service.ts) - approveSalesDeliveryAtomic
calls the RPC right after fetching productItems. Early return on shortages
with new InventoryShortageItem[] field on AtomicTransactionResult. If the
RPC itself errors, we log and continue (trigger remains safety net).

Command service - SalesInvoiceWarehouseCommandError gains details param;
when shortages are present, throws with them attached.

API route - on caught error, remaps service-shape (requested/available)
to UI-shape (required_qty/available_qty) and includes shortages in response.

Result: approver sees the existing shortage modal listing exactly which
items are short and by how much, instead of a generic toast.

3 TS files updated via bash heredoc Python (Edit tool was truncating them).
TypeScript: 0 errors in v3.74.74 files." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.74 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.73.ps1') { Remove-Item -LiteralPath 'push_v3.74.73.ps1' -Force }
}
