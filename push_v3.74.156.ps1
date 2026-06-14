$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.155.ps1") { Remove-Item -LiteralPath "push_v3.74.155.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.156"') { Write-Host "+ 3.74.156" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_156.txt"
    $msgLines = @(
        "chore(db): v3.74.156 - auto-sync display_/original_ totals via trigger",
        "",
        "Defence-in-depth followup to v3.74.154 and v3.74.155. Those two",
        "fixes patched the bill and invoice edit forms so they keep the",
        "display_/original_ snapshot columns in lockstep with the canonical",
        "total_amount/subtotal. This commit adds a DB-side BEFORE UPDATE",
        "trigger that does the same thing automatically, so any future code",
        "path that updates total_amount but forgets the snapshot columns",
        "can't reintroduce the drift bug.",
        "",
        "Migration applied to Supabase:",
        "  v3_74_156_sync_display_totals_triggers",
        "",
        "Function:",
        "  public.sync_display_totals_from_total()",
        "    On a row with exchange_rate IS NULL OR = 1 (i.e. base",
        "    currency), if total_amount or subtotal changed in this UPDATE,",
        "    mirror the new value into display_/original_. FX rows are",
        "    left alone because their display_/original_ columns hold the",
        "    localised totals and must be set explicitly by the caller.",
        "",
        "Triggers (BEFORE UPDATE OF total_amount, subtotal):",
        "  - trg_z_sync_display_totals_bills    on public.bills",
        "  - trg_z_sync_display_totals_invoices on public.invoices",
        "",
        "  The 'z' prefix sorts these after the existing protection",
        "  triggers (trg_prevent_paid_invoice_modification,",
        "  trg_prevent_bill_modification_trigger), so paid/partially_paid",
        "  rows still get blocked on total_amount edits the same way they",
        "  do today - the sync trigger only fires on edits that the",
        "  protection lets through.",
        "",
        "  Triggers fire only when total_amount or subtotal is in the",
        "  UPDATE column list, so the cost on UPDATEs that don't touch",
        "  totals (status flips, paid_amount recalc, etc.) is zero.",
        "",
        "Tables checked, no triggers needed:",
        "  - sales_orders    : no display_/original_ columns",
        "  - purchase_orders : no display_/original_ columns",
        "",
        "Code changes:",
        "  lib/version.ts",
        "    - Bumped to 3.74.156 (DB-only change, no app code touched).",
        "",
        "How to verify after this is live:",
        "  - Edit a draft/pending bill or invoice and change the total.",
        "  - The bills/invoices list and the supplier/customer ledger",
        "    should both show the new total - no manual display_total",
        "    refresh needed."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.156 pushed" -ForegroundColor Green
}
