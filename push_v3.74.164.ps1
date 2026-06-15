$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.163.ps1") { Remove-Item -LiteralPath "push_v3.74.163.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.164"') { Write-Host "+ 3.74.164" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000164_v3_74_164_prevent_purchase_return_overflow.sql")) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_164.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.164 - prevent parallel over-return on same bill_item",
        "",
        "Bug from tester:",
        "  Bill has product qty=5. User A creates a partial return for qty=2",
        "  (status: pending_admin_approval). Before A is approved, user B",
        "  creates another return for qty=4. Both individually fit, both pass",
        "  creation. Admin approves both. Warehouse posts the first; the",
        "  second explodes inside confirm_purchase_return_delivery_v3 with",
        "  'Cannot return 4 units. Available: 3' - blamed on the warehouse",
        "  user, even though they did nothing wrong.",
        "",
        "Root cause:",
        "  process_purchase_return_atomic only validated quantity when posting",
        "  (NOT v_is_pending). Pending creates skipped the check entirely.",
        "  Bill_items.returned_quantity is only updated on warehouse confirm,",
        "  so pending returns weren't visible to subsequent creators either.",
        "",
        "Fix - defense-in-depth at the bill_item level:",
        "  supabase/migrations/20260615000164_v3_74_164_prevent_purchase_return_overflow.sql",
        "    - New function check_purchase_return_item_quantity():",
        "      1. Takes pg_advisory_xact_lock keyed by bill_item_id to",
        "         serialize concurrent inserts on the same line.",
        "      2. SELECT ... FOR UPDATE on bill_items.quantity.",
        "      3. Sums quantity from all OTHER purchase_return_items pointing",
        "         at this bill_item whose parent return is NOT in",
        "         (rejected, warehouse_rejected, cancelled). Excludes self by",
        "         id (matters for UPDATEs).",
        "      4. If (active_sum + NEW.quantity) > bill_item.quantity,",
        "         raises check_violation with an Arabic message that tells",
        "         the user the exact available quantity.",
        "    - Trigger trg_check_purchase_return_item_quantity fires BEFORE",
        "      INSERT OR UPDATE OF (quantity, bill_item_id, purchase_return_id).",
        "    - Covers all three call sites (atomic, multi_warehouse, resubmit)",
        "      because they all INSERT into purchase_return_items.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.164.",
        "",
        "Production smoke test (already applied via apply_migration):",
        "  Used existing bill_item id=8f8c0af3-... with quantity=5.",
        "    A: qty=2  → OK",
        "    B: qty=4 on top of A (would total 6) → BLOCKED with the Arabic",
        "       message above.",
        "    C: qty=3 on top of A (totals 5 = limit) → OK.",
        "  Test rows cleaned up afterwards.",
        "",
        "How to verify in UI:",
        "  - As accountant in branch X, create partial purchase return for",
        "    qty=2 on a product whose bill quantity is 5. Submit.",
        "  - As a different accountant (or same user, different return),",
        "    try to create another partial return on the same line for",
        "    qty=4. The form / API should report the new Arabic message",
        "    instead of letting the row save.",
        "  - The valid combinations remain working: qty <= 3 (= 5 - 2)",
        "    saves normally."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.164 pushed" -ForegroundColor Green
}
