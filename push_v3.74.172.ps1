$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.171.ps1") { Remove-Item -LiteralPath "push_v3.74.171.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.172"') { Write-Host "+ 3.74.172" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000172_v3_74_172_production_issue_receipt_journal_entries.sql")) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_172.txt"
    $msgLines = @(
        "fix(production): v3.74.172 - issue and receipt now write GL entries",
        "",
        "Same root cause family as v3.74.171: a workflow updates FIFO lots",
        "without a matching journal_entry, so GL drifts behind FIFO until",
        "ic_inventory_gl_vs_fifo trips the tolerance threshold and the",
        "dashboard surfaces the anomaly. v3.74.171 fixed the purchase-",
        "return half. This commit fixes the production half: every",
        "production order issue and every production order receipt now",
        "writes the matching GL pair into journal_entries.",
        "",
        "Lines posted:",
        "  Issue event (one JE per event):",
        "    Dr 1145 (WIP) / Cr 1140 (Inventory) = FIFO cost consumed",
        "  Receipt event (one JE per event):",
        "    Dr 1140 (Inventory) / Cr 1145 (WIP) = received_qty x unit_cost",
        "",
        "Implementation:",
        "  - _production_get_or_create_je helper finds or creates a posted",
        "    JE keyed by (reference_type, reference_id = event_id) so a",
        "    multi-line event ends up with one JE.",
        "  - post_production_issue_journal_entry trigger fires AFTER",
        "    INSERT on production_order_issue_lines. Cost read from",
        "    fifo_lot_consumptions (consumption_type='production_issue').",
        "  - post_production_receipt_journal_entry trigger fires AFTER",
        "    INSERT on production_order_receipt_lines. Cost read from",
        "    fifo_cost_lots tied to the line via fifo_cost_lot_id.",
        "  - Both temporarily set app.allow_direct_post=true so the",
        "    enforce_je_integrity safety net allows the insert.",
        "",
        "Backfill (already applied to production):",
        "  - One pre-existing issue + one pre-existing receipt on company",
        "    8ef6338c-... had no JE. SQL backfill posted both with the",
        "    correct Dr/Cr pairs (5 EGP each).",
        "  - Verification: ic_ap_balance and ic_inventory_gl_vs_fifo both",
        "    return zero rows. Dashboard anomaly badges cleared.",
        "",
        "Files:",
        "  supabase/migrations/20260615000172_v3_74_172_production_issue_receipt_journal_entries.sql",
        "    - Helper + 2 trigger functions + 2 triggers.",
        "  lib/version.ts",
        "    - Bumped to 3.74.172.",
        "",
        "How to verify going forward:",
        "  - Post any production order issue. journal_entries gets a row",
        "    with reference_type='production_issue' and the Dr/Cr pair.",
        "  - Post any production order receipt. journal_entries gets a row",
        "    with reference_type='production_receipt' and the Dr/Cr pair.",
        "  - GL 1140 stays in sync with FIFO remaining value across the",
        "    whole production cycle."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.172 pushed" -ForegroundColor Green
}
