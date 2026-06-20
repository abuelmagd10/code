$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.243.ps1") { Remove-Item -LiteralPath "push_v3.74.243.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.244"') {
    Write-Host "+ 3.74.244" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000244_v3_74_244_allow_delivery_approval_fields_on_paid_invoices.sql" -Raw
foreach ($f in @('warehouse_status', 'approval_status', 'approved_by', 'shipping_provider_id', 'tracking_number')) {
    if ($mig -notmatch "'$f'") {
        Write-Host "X migration missing $f in allowed_fields" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ delivery / approval / shipping fields added to allowed_fields" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_244.txt"
    $msgLines = @(
        "fix(invoices): v3.74.244 - paid invoices accept delivery / approval updates",
        "",
        "Reported: owner created an invoice, took payment up front, then",
        "the dispatch officer tried to approve the warehouse delivery. The",
        "request failed with",
        "  لا يمكن تعديل الفاتورة المدفوعة. الحقل المعدل: warehouse_status",
        "from trigger prevent_paid_invoice_modification.",
        "",
        "Root cause: the trigger guards revenue-relevant columns on paid",
        "invoices, but its allow-list only covered status / paid_amount /",
        "returns / notes / soft-delete. The operational dispatch workflow",
        "writes to warehouse_status, approval_status, approved_by,",
        "approval_date, approval_reason, shipping_provider_id, tracking_number,",
        "and shipped_at / delivered_at. None of these touch the financial",
        "totals, so blocking them is wrong - it forces the user to reverse",
        "the payment before they can ship the order.",
        "",
        "Fix: extend allowed_fields to cover the full delivery / approval /",
        "shipping workflow plus bonus / commission tracking columns the",
        "sales-bonus engine touches once payment lands. Financial integrity",
        "columns (total_amount, subtotal, tax_amount, customer_id, currency_code,",
        "line items, etc.) stay locked.",
        "",
        "Migration applied to live DB and committed for the next environment",
        "rebuild.",
        "",
        "  supabase/migrations/20260620000244_v3_74_244_allow_delivery_approval_fields_on_paid_invoices.sql",
        "  lib/version.ts -> 3.74.244"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.244 pushed" -ForegroundColor Green
}
