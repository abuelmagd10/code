$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.185.ps1") { Remove-Item -LiteralPath "push_v3.74.185.ps1" -Force }
if (Test-Path "push_v3.74.186.ps1") { Remove-Item -LiteralPath "push_v3.74.186.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.187"') { Write-Host "+ 3.74.187" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/sales-returns.ts" -Raw
if ($svc -notmatch "original_currency: invoiceCurrency") {
    Write-Host "X sales-returns service does not persist original_currency" -ForegroundColor Red
    exit 1
}
Write-Host "+ sales-returns service captures FX snapshot" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_187.txt"
    $msgLines = @(
        "feat(sales-returns): v3.74.187 - persist original currency + exchange rate",
        "",
        "Part 1 of 4 in the multi-currency audit follow-up (v3.74.186).",
        "Aligns sales_returns with the FX columns that purchase_returns",
        "has carried since v3.27.4, so a return on a USD invoice keeps",
        "the rate used at return time rather than being silently treated",
        "as base currency.",
        "",
        "DB:",
        "  supabase/migrations/20260616000187_v3_74_187_sales_returns_multi_currency.sql",
        "    - Adds original_currency, original_subtotal,",
        "      original_tax_amount, original_total_amount,",
        "      exchange_rate_used, exchange_rate_id,",
        "      exchange_rate_at_return.",
        "    - Backfills existing rows from the linked invoice's currency",
        "      and rate. Rows without a linked invoice get an EGP / rate",
        "      = 1 default so the integrity checks stop flagging them.",
        "",
        "Service:",
        "  lib/sales-returns.ts",
        "    - Invoice SELECT now also pulls currency_code, exchange_rate,",
        "      exchange_rate_used, exchange_rate_id.",
        "    - The salesReturn payload now includes original_currency +",
        "      original_subtotal/tax/total + exchange_rate_used /",
        "      _at_return / _id. When the invoice was foreign-currency the",
        "      'original_*' amounts are computed by dividing the base-",
        "      currency totals by the invoice's rate (which is what is",
        "      stored on the invoice itself).",
        "",
        "UI:",
        "  app/sales-returns/page.tsx",
        "    - Invoice list SELECT pulls currency_code + exchange_rate.",
        "    - Each row now derives original_currency + original_total_",
        "      amount from the invoice's FX columns.",
        "    - Amount column formatter shows the base-currency total",
        "      (existing behaviour) plus a smaller second line with the",
        "      original-currency total when the invoice was not in EGP.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.187.",
        "",
        "Next versions in the audit:",
        "  - v3.74.188: customer_credits / customer_credit_ledger",
        "  - v3.74.189: vendor_credits",
        "  - v3.74.190: estimates"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.187 pushed" -ForegroundColor Green
}
