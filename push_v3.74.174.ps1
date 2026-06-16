$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.173.ps1") { Remove-Item -LiteralPath "push_v3.74.173.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.174"') { Write-Host "+ 3.74.174" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000174_v3_74_174_purchase_return_warehouse_stock_check.sql")) {
    Write-Host "X migration file missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration file present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_174.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.174 - block returns that exceed warehouse stock",
        "",
        "Tester question: what happens if a branch accountant requests a",
        "return for more units than the branch warehouse currently holds?",
        "",
        "Investigation:",
        "  Nothing stops it. process_purchase_return_atomic gates its",
        "  stock check on NOT v_is_pending, but every normal create runs",
        "  with status='pending_admin_approval'. confirm_purchase_return_",
        "  delivery_v2 then writes the negative inventory_transaction",
        "  unchecked. Net result: a 3-unit return on a 0-stock warehouse",
        "  drives inventory_transactions to -3 - negative physical stock,",
        "  broken FIFO state, ledger drift, and the supplier walks away",
        "  paid for goods that were never handed over.",
        "",
        "Fix:",
        "  supabase/migrations/20260615000174_v3_74_174_purchase_return_warehouse_stock_check.sql",
        "    - BEFORE INSERT/UPDATE trigger on purchase_return_items:",
        "        * Resolves warehouse from the item (preferred) or from",
        "          the parent purchase_returns row. Skipped when both are",
        "          null (multi-warehouse master row - its allocations are",
        "          checked individually).",
        "        * Per (warehouse_id, product_id) pg_advisory_xact_lock",
        "          serializes concurrent creates on the same line.",
        "        * Current stock from inventory_transactions sum.",
        "        * Pending reservation = sum of qty in OTHER purchase_",
        "          return_items at this product+warehouse whose parent",
        "          workflow_status is pre-confirm",
        "          (pending_admin_approval / pending_approval /",
        "           pending_warehouse / partial_approval).",
        "        * available = current_stock - pending_reservation.",
        "          Requested > available -> Arabic check_violation listing",
        "          current stock, pending reservation, available, and",
        "          requested values.",
        "    - Trigger pairs with v3.74.164 (bill-line over-return). That",
        "      check fires first on the bill_item constraint, then this",
        "      one on warehouse availability.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.174.",
        "",
        "Production smoke test (already applied via apply_migration):",
        "  - Created a TEST purchase return on BILL-0002 in the company",
        "    test branch (مدينة نصر). Attempted to insert a 1-unit return",
        "    item for VitaSlims, whose stock at the warehouse is 0.",
        "  - Trigger raised the expected check_violation:",
        "      'لا يَكفى المَخزون لِتَنفيذ هذا المَرتَجَع. المُتَوَفِّر",
        "       فِعلياً فى المَخزَن: 0، المَحجوز فى مَرتَجَعات قَيد",
        "       الاعتماد: 0، الكَمية المُتاحَة للمَرتَجَع: 0، الكَمية",
        "       المَطلوبَة: 1.00.'",
        "  - Test row cleaned up afterwards.",
        "",
        "How to verify going forward:",
        "  - As branch accountant, try to create a return for more units",
        "    than the branch warehouse currently has. The form gets the",
        "    Arabic error and the row is not saved.",
        "  - As another user, submit a second pending return for the same",
        "    product+warehouse. Available stock now reflects the first's",
        "    reservation; trying to over-return triggers the same error.",
        "  - Once both reach warehouse approval, normal stock check runs",
        "    and inventory_transactions stays non-negative.",
        "",
        "Related side fix (already deployed by hand, no code in this commit):",
        "  - VC-67525 vendor_credit row that was created by the old",
        "    confirm_v2 path for the cash-settled PRET-67525 was archived",
        "    and deleted. The supplier 'مستحقات لنا (سُلفَة مورد)' column",
        "    no longer shows the phantom 2 EGP."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.174 pushed" -ForegroundColor Green
}
