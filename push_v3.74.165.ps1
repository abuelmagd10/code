$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.164.ps1") { Remove-Item -LiteralPath "push_v3.74.164.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.165"') { Write-Host "+ 3.74.165" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000165_v3_74_165_prevent_sales_return_overflow.sql")) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_165.txt"
    $msgLines = @(
        "fix(sales-returns): v3.74.165 - prevent parallel over-return on same invoice line",
        "",
        "Mirror of v3.74.164 for the sales side. The architecture is",
        "different - sales_return_requests stores items as a JSONB array",
        "column instead of a separate items table during the pending",
        "phase. The check therefore parses the JSONB and locks per",
        "invoice_item_id.",
        "",
        "Scenario it now blocks:",
        "  Invoice line qty = 5. Salesperson A submits a return request",
        "  for qty 2 (pending_approval_level_1). Salesperson B submits",
        "  another request for qty 4 before A is approved. Both used to",
        "  pass creation; admin would approve both; the second would",
        "  explode at warehouse posting because invoice_items.quantity",
        "  was breached.",
        "",
        "Fix - defense-in-depth at the bill_item/invoice_item level:",
        "  supabase/migrations/20260615000165_v3_74_165_prevent_sales_return_overflow.sql",
        "    - New function check_sales_return_request_quantity():",
        "      * Skips the check when status is moving into a terminal",
        "        state (approved_completed / rejected_*) - those rows no",
        "        longer reserve quantity.",
        "      * For each JSONB item:",
        "        - Reads invoice_items.quantity FOR UPDATE.",
        "        - Sums sales_return_items.quantity for the same",
        "          invoice_item_id (already-posted committed returns).",
        "        - Sums qtyToReturn + qtyCreditOnly across OTHER active",
        "          sales_return_requests pointing at the same",
        "          invoice_item (status IN pending / pending_approval_level_1 /",
        "          pending_warehouse_approval).",
        "        - Compares committed + pending_other + this_request_qty",
        "          against invoice_items.quantity.",
        "      * Per-invoice_item pg_advisory_xact_lock serializes",
        "        concurrent requests on the same line.",
        "      * Arabic check_violation message lists invoice qty,",
        "        committed total, pending total, and available qty.",
        "    - Trigger trg_check_sales_return_request_quantity fires",
        "      BEFORE INSERT OR UPDATE OF (items, status).",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.165.",
        "",
        "Production smoke test (applied via apply_migration):",
        "  Used invoice_item id=e0858a3a-... quantity=2.",
        "    Request A: qtyToReturn=1                → OK",
        "    Request B: qtyToReturn=2 stacked on A   → BLOCKED",
        "    Request C: qtyToReturn=1 stacked on A   → OK (sum = 2 = limit)",
        "  Test rows cleaned up afterwards.",
        "",
        "How to verify in UI:",
        "  - As branch accountant, request partial sales return for qty 2",
        "    on a product whose invoice line has qty 5. Submit.",
        "  - As a second user, try to request another partial return for",
        "    qty 4 on the same invoice line. The form gets the Arabic",
        "    error and the row is not saved.",
        "  - Total available going forward = invoice line qty minus all",
        "    pending+committed reservations."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.165 pushed" -ForegroundColor Green
}
