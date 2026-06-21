$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.254.ps1") { Remove-Item -LiteralPath "push_v3.74.254.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.255"') {
    Write-Host "+ 3.74.255" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Remove the duplicates we created earlier (these still exist on disk after `git rm`)
$pathsToRemove = @(
  "app/refund-approvals",
  "app/api/refund-approvals",
  "app/api/refund-requests/[id]",
  "supabase/migrations/20260620000253_v3_74_253_refund_requests_table.sql",
  "supabase/migrations/20260620000254_v3_74_254_refund_badge_in_approval_badges_rpc.sql"
)
foreach ($p in $pathsToRemove) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Recurse -Force
        Write-Host "+ removed $p" -ForegroundColor Green
    }
}

# Verify the integration is now via customer_refund_requests
$inv = Get-Content -LiteralPath "app/api/invoices/[id]/pre-shipment-refund/route.ts" -Raw
if ($inv -notmatch [regex]::Escape('customer_refund_requests')) {
    Write-Host "X invoice route not wired to customer_refund_requests" -ForegroundColor Red; exit 1
}
if ($inv -match [regex]::Escape('.from("refund_requests")')) {
    Write-Host "X invoice route still inserts into refund_requests" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice pre-shipment refund uses customer_refund_requests" -ForegroundColor Green

$exec = Get-Content -LiteralPath "app/api/customer-refund-requests/[id]/execute/route.ts" -Raw
if ($exec -notmatch [regex]::Escape("source_type === 'pre_shipment'")) {
    Write-Host "X execute endpoint missing pre_shipment branch" -ForegroundColor Red; exit 1
}
if ($exec -notmatch [regex]::Escape('executePreShipmentRefund')) {
    Write-Host "X execute endpoint doesn't call executor" -ForegroundColor Red; exit 1
}
Write-Host "+ existing customer-refund-requests execute endpoint handles pre_shipment" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/customer-refund-requests/page.tsx" -Raw
if ($page -notmatch [regex]::Escape("استرداد قبل الشحن")) {
    Write-Host "X customer-refund-requests page doesn't label pre_shipment" -ForegroundColor Red; exit 1
}
Write-Host "+ existing /customer-refund-requests page labels pre-shipment requests" -ForegroundColor Green

$side = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($side -match [regex]::Escape("/refund-approvals")) {
    Write-Host "X sidebar still has the removed /refund-approvals link" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar no longer links to the removed page" -ForegroundColor Green

$bill = Get-Content -LiteralPath "app/api/bills/[id]/pre-receipt-refund/route.ts" -Raw
if ($bill -match [regex]::Escape('.from("refund_requests")')) {
    Write-Host "X bill route still references refund_requests" -ForegroundColor Red; exit 1
}
Write-Host "+ bill pre-receipt refund is owner/GM-only for now (pending vendor_refund_requests integration)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_255.txt"
    $msgLines = @(
        "refactor(refunds): v3.74.255 - reuse customer_refund_requests, drop duplicate page",
        "",
        "Walks back the duplication introduced in v3.74.253:",
        "",
        "Removed",
        "  - Table refund_requests (dropped from DB)",
        "  - Page /refund-approvals",
        "  - APIs /api/refund-approvals/*, /api/refund-requests/[id]/(approve|reject|cancel)",
        "  - Sidebar 'Refund Approvals' link + refund_request_pending badge key",
        "  - Migrations 20260620000253 / 20260620000254 (their effects reverted)",
        "",
        "Re-wired (sales)",
        "  POST /api/invoices/[id]/pre-shipment-refund now inserts into the",
        "  existing customer_refund_requests table with source_type='pre_shipment'.",
        "  mode (cancel_invoice / keep_open) is stored in metadata.mode.",
        "  Owner / GM still self-execute. Other roles create a row that lands",
        "  on the existing /customer-refund-requests approval page.",
        "  /api/customer-refund-requests/[id]/execute gained a branch for",
        "  source_type='pre_shipment' that calls executePreShipmentRefund.",
        "  The /customer-refund-requests page labels pre_shipment rows with",
        "  the icon and Arabic text 'استرداد قبل الشحن' so the owner can",
        "  filter visually between the existing kinds (payment_correction,",
        "  delivery_rejection, credit_refund) and the new one.",
        "",
        "Re-wired (purchases)",
        "  POST /api/bills/[id]/pre-receipt-refund is owner/GM-only for now",
        "  while vendor_refund_requests is being extended in a follow-up.",
        "  No external workflow yet on the purchases side.",
        "",
        "Files",
        "  app/api/invoices/[id]/pre-shipment-refund/route.ts",
        "  app/api/bills/[id]/pre-receipt-refund/route.ts",
        "  app/api/customer-refund-requests/[id]/execute/route.ts",
        "  app/customer-refund-requests/page.tsx",
        "  app/invoices/[id]/page.tsx",
        "  app/bills/[id]/page.tsx",
        "  components/sidebar.tsx",
        "  lib/version.ts -> 3.74.255",
        "  + deleted: app/refund-approvals, app/api/refund-approvals,",
        "    app/api/refund-requests/[id]/(approve|reject|cancel),",
        "    two migrations from v3.74.253 / v3.74.254."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.255 pushed" -ForegroundColor Green
}
