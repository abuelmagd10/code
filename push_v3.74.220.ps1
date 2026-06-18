$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.219.ps1") { Remove-Item -LiteralPath "push_v3.74.219.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.220"') {
    Write-Host "+ 3.74.220" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
if ($page -notmatch "baseAmt / invRate") {
    Write-Host "X paidByInvoice formula not updated" -ForegroundColor Red; exit 1
}
if ($page -match "pAmount \* factor") {
    Write-Host "X old multiply-by-rate formula still present" -ForegroundColor Red; exit 1
}
Write-Host "+ paidByInvoice now divides base_currency_amount by invoice rate" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_220.txt"
    $msgLines = @(
        "fix(invoices-list): v3.74.220 - stop double-multiplying USD payments by the exchange rate",
        "",
        "Side-effect of v3.74.219: after the RPC started storing payment.amount",
        "as the BASE-currency equivalent (5.50 EGP for a 0.10 USD payment),",
        "the invoices list still ran the v3.22.0 cross-currency formula",
        "  amount × (payRate / invRate)",
        "which assumed amount was in the PAYMENT currency. For the EGP",
        "invoice INV-00005 + USD payment row it computed",
        "  5.50 × (55 / 1) = 302.50",
        "and the list showed Paid = 314.50 (= 17.50 real + the extra 297) /",
        "Remaining = -294.50 (rendered as a negative credit on the row).",
        "",
        "Fix: every payment row carries base_currency_amount (or amount as",
        "fallback) - always the base equivalent. The unified formula",
        "  paidInInvoiceCcy = base_currency_amount / invoice.exchange_rate",
        "lands in invoice currency for every combination (same-currency,",
        "cross-currency, FC invoice, base invoice) without depending on",
        "any assumption about which currency `amount` is in.",
        "",
        "INV-00005 will now read 17.50 / 2.50 - matching reality.",
        "",
        "  app/invoices/page.tsx (paidByInvoice memo)",
        "  lib/version.ts -> 3.74.220"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.220 pushed" -ForegroundColor Green
}
