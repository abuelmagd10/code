$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.255.ps1") { Remove-Item -LiteralPath "push_v3.74.255.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.256"') {
    Write-Host "+ 3.74.256" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260620000256_v3_74_256_vendor_refund_requests_pre_receipt_columns.sql")) {
    Write-Host "X migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ vendor_refund_requests migration present" -ForegroundColor Green

$bill = Get-Content -LiteralPath "app/api/bills/[id]/pre-receipt-refund/route.ts" -Raw
foreach ($c in @('vendor_refund_requests','source_type: "pre_receipt"','SELF_EXECUTE_ROLES')) {
    if ($bill -notmatch [regex]::Escape($c)) { Write-Host "X bill route missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bill route inserts into vendor_refund_requests for non-owner/GM" -ForegroundColor Green

if (-not (Test-Path -LiteralPath "app/api/vendor-refund-requests/[id]/execute-pre-receipt/route.ts")) {
    Write-Host "X execute-pre-receipt endpoint missing" -ForegroundColor Red; exit 1
}
Write-Host "+ execute-pre-receipt endpoint present" -ForegroundColor Green

$sup = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($sup -notmatch [regex]::Escape("source_type === 'pre_receipt'")) {
    Write-Host "X suppliers page doesn't branch on source_type" -ForegroundColor Red; exit 1
}
if ($sup -notmatch [regex]::Escape("/api/vendor-refund-requests/")) {
    Write-Host "X suppliers page doesn't call new endpoint" -ForegroundColor Red; exit 1
}
Write-Host "+ suppliers page approve handler routes pre_receipt to the executor" -ForegroundColor Green

$bil2 = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($bil2 -notmatch [regex]::Escape("vendor_refund_requests")) {
    Write-Host "X bill page rejection banner not wired to vendor_refund_requests" -ForegroundColor Red; exit 1
}
Write-Host "+ bill page surfaces last rejection from vendor_refund_requests" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_256.txt"
    $msgLines = @(
        "refactor(refunds): v3.74.256 - reuse vendor_refund_requests for pre-receipt refund",
        "",
        "Closes the purchases-side gap left in v3.74.255 the same way the",
        "sales-side was closed: by extending an existing table + page",
        "rather than creating a new one.",
        "",
        "Database",
        "  vendor_refund_requests gains source_type ('standard' or 'pre_receipt'),",
        "  bill_id, metadata jsonb, executed_by, executed_at. The status",
        "  CHECK list is extended with 'executed'.",
        "",
        "API",
        "  POST /api/bills/[id]/pre-receipt-refund now branches:",
        "    owner / general_manager  -> execute immediately (existing).",
        "    other roles              -> insert pending_approval into",
        "    vendor_refund_requests with source_type='pre_receipt'.",
        "    Mode (cancel_bill / keep_open) + settlement account are stored",
        "    in metadata.",
        "  POST /api/vendor-refund-requests/[id]/execute-pre-receipt (new)",
        "    is what the suppliers page calls when approving a pre_receipt",
        "    row; it invokes executePreReceiptRefund and marks the row as",
        "    executed.",
        "",
        "UI",
        "  app/suppliers/page.tsx approve handler wraps the legacy",
        "  approve_vendor_refund_request RPC with a check: if source_type is",
        "  'pre_receipt', fetch the new executor endpoint instead so the",
        "  payments are voided and the bill / PO are optionally cancelled.",
        "  app/bills/[id]/page.tsx restores the rejected-banner, now reading",
        "  the last rejected vendor_refund_requests row for the bill.",
        "",
        "Files",
        "  app/api/bills/[id]/pre-receipt-refund/route.ts",
        "  app/api/vendor-refund-requests/[id]/execute-pre-receipt/route.ts (new)",
        "  app/suppliers/page.tsx",
        "  app/bills/[id]/page.tsx",
        "  supabase/migrations/20260620000256_v3_74_256_vendor_refund_requests_pre_receipt_columns.sql",
        "  lib/version.ts -> 3.74.256"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.256 pushed" -ForegroundColor Green
}
