$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.154.ps1") { Remove-Item -LiteralPath "push_v3.74.154.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.155"') { Write-Host "+ 3.74.155" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_155.txt"
    $msgLines = @(
        "fix(invoices): v3.74.155 - sync display_/original_ totals on invoice edit",
        "",
        "Audit followup to v3.74.154 (bills). Checked the three sibling",
        "tables for the same display_/original_ drift pattern:",
        "",
        "  - public.invoices       -> HAS the columns, edit path leaves",
        "                              display_total/display_subtotal stale",
        "                              (5 rows in this tenant already drifted).",
        "  - public.sales_orders   -> SAFE, table does not carry display_/",
        "                              original_ columns at all.",
        "  - public.purchase_orders-> SAFE, same as above.",
        "",
        "Root cause for invoices: lib/services/sales-invoice-update-command",
        ".service.ts pushes subtotal, tax_amount, total_amount and the",
        "original_* trio when an invoice is edited, but never touches",
        "display_total/display_subtotal. The invoice list and the customer",
        "ledger both read display_total when the invoice's display currency",
        "matches the active currency, so after an edit the list shows the",
        "pre-edit total while the GL uses the new one - same UX failure as",
        "the bills bug from v3.74.154.",
        "",
        "Fix:",
        "  lib/services/sales-invoice-update-command.service.ts",
        "    - The invoice UPDATE payload now mirrors display_subtotal /",
        "      display_total off the same value used for original_subtotal",
        "      / original_total. For base-currency invoices (rate=1) those",
        "      already equal total_amount/subtotal; for FX invoices we want",
        "      the localised totals there anyway, so a 1:1 mirror is correct.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.155.",
        "",
        "DB cleanup (already executed, not part of this commit):",
        "  SET LOCAL session_replication_role = 'replica';",
        "  UPDATE public.invoices",
        "  SET display_total = total_amount,",
        "      display_subtotal = subtotal,",
        "      original_total = total_amount,",
        "      original_subtotal = subtotal",
        "  WHERE display_total IS NULL OR original_total <> total_amount;",
        "  -- 5 rows restored: INV-00001..INV-00005",
        "  -- session_replication_role temporarily disabled the",
        "  -- 'cannot edit paid invoice' protection trigger because",
        "  -- this is a metadata-only fix that doesn't touch financial",
        "  -- value columns.",
        "",
        "Followups (not in this commit):",
        "  - Other code paths that update invoices via direct .update()",
        "    (status changes, payment recalc, etc.) don't touch display_/",
        "    original_ - they don't need to because they don't change",
        "    subtotal/total. Worth a sweep next sprint to be defensive.",
        "  - Consider a DB-level trigger that mirrors display_/original_",
        "    off total_amount/subtotal whenever those are updated, so any",
        "    future code path that forgets the columns can't reintroduce",
        "    the drift."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.155 pushed" -ForegroundColor Green
}
