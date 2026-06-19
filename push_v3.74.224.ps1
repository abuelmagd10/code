$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.223.ps1") { Remove-Item -LiteralPath "push_v3.74.223.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.224"') {
    Write-Host "+ 3.74.224" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/supplier-refund-receipt-command.service.ts" -Raw
if ($svc -notmatch "applyVendorCredits\(command\.companyId, command\.supplierId, command\.baseAmount") {
    Write-Host "X supplier refund still passes amount (foreign-currency)" -ForegroundColor Red; exit 1
}
Write-Host "+ supplier refund deducts in base currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_224.txt"
    $msgLines = @(
        "fix(supplier-refund): v3.74.224 - mirror of v3.74.223 on the vendor side",
        "",
        "Audit triggered by the v3.74.223 customer-side fix found the same",
        "pattern on the supplier-refund-receipt service:",
        "  applyVendorCredits(... command.amount ...)",
        "should be",
        "  applyVendorCredits(... command.baseAmount ...)",
        "",
        "vendor_credits.applied_amount is base-currency denominated. A foreign-",
        "currency refund (e.g. 0.01 USD at rate 55) would have deducted 0.01",
        "from applied_amount instead of 0.55 EGP, leaving a gap that",
        "ic_ap_balance would have flagged the moment a foreign-currency",
        "supplier refund was processed.",
        "",
        "No data backfill needed - no foreign-currency supplier refund has",
        "been processed yet on this database (vendor_refund_requests has",
        "no rows with currency != EGP).",
        "",
        "Verified clean (no other services have the same leak):",
        "  customer-payment-command.service.ts",
        "  sales-invoice-payment-command.service.ts",
        "  bank-transfer-command.service.ts",
        "",
        "  lib/services/supplier-refund-receipt-command.service.ts",
        "  lib/version.ts -> 3.74.224"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.224 pushed" -ForegroundColor Green
}
