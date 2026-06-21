$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.256.ps1") { Remove-Item -LiteralPath "push_v3.74.256.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.257"') {
    Write-Host "+ 3.74.257" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "supabase/migrations/20260620000257_v3_74_257_allow_pre_shipment_refund_fields.sql")) {
    Write-Host "X migration missing" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260620000257_v3_74_257_allow_pre_shipment_refund_fields.sql" -Raw
foreach ($c in @('pre_shipment_refund_at','pre_shipment_refund_mode','prevent_paid_invoice_modification')) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration extends allow_fields on prevent_paid_invoice_modification" -ForegroundColor Green

$ship = Get-Content -LiteralPath "lib/pre-shipment-refund.ts" -Raw
if ($ship -notmatch [regex]::Escape("invUpdErr")) {
    Write-Host "X pre-shipment executor still ignores invoice update errors" -ForegroundColor Red; exit 1
}
Write-Host "+ pre-shipment executor surfaces invoice update errors" -ForegroundColor Green

$rcpt = Get-Content -LiteralPath "lib/pre-receipt-refund.ts" -Raw
if ($rcpt -notmatch [regex]::Escape("billUpdErr")) {
    Write-Host "X pre-receipt executor still ignores bill update errors" -ForegroundColor Red; exit 1
}
Write-Host "+ pre-receipt executor surfaces bill update errors" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_257.txt"
    $msgLines = @(
        "fix(refunds): v3.74.257 - allow pre_shipment_refund_* on paid invoices + capture executor errors",
        "",
        "Reported: customer paid 1500 on a 1600 invoice, didn't receive the",
        "goods, refund was issued and invoice cancelled, but the customer",
        "balance kept showing 100 EGP owed. INV-00005 in notniche.",
        "",
        "Root cause: prevent_paid_invoice_modification raised on the new",
        "pre_shipment_refund_* columns because they were never added to its",
        "allow_fields list. Postgres aborted the executor's invoice UPDATE",
        "entirely. The status flipped to 'cancelled' from a different path",
        "(SO cancellation cascade), but paid_amount stayed at 1500 and",
        "pre_shipment_refund_at stayed null. Aging reports that compute",
        "outstanding from total_amount - paid_amount then showed phantom AR.",
        "",
        "The executor was also swallowing the trigger error - .update() ran",
        "without await {error}, so the failure was invisible.",
        "",
        "Fix",
        "  - Migration: add pre_shipment_refund_at / _by / _amount / _mode /",
        "    _reason / _je_id to the prevent_paid_invoice_modification",
        "    allow_fields. The bills equivalent (trg_prevent_bill_modification)",
        "    already only blocks total_amount, so the purchases side was not",
        "    affected.",
        "  - Both executors now capture the row UPDATE error and return a",
        "    clear failure message instead of silently swallowing it.",
        "  - Cleanup applied directly to INV-00005: paid_amount = 0 and the",
        "    pre_shipment_refund_* audit columns stamped so the existing",
        "    aging reports stop showing the phantom 100 EGP.",
        "",
        "Files",
        "  supabase/migrations/20260620000257_v3_74_257_allow_pre_shipment_refund_fields.sql",
        "  lib/pre-shipment-refund.ts",
        "  lib/pre-receipt-refund.ts",
        "  lib/version.ts -> 3.74.257"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.257 pushed" -ForegroundColor Green
}
