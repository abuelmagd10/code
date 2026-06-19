$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.221.ps1") { Remove-Item -LiteralPath "push_v3.74.221.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.222"') {
    Write-Host "+ 3.74.222" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$dlg = Get-Content -LiteralPath "components/customers/customer-refund-dialog.tsx" -Raw
if ($dlg -notmatch "setRefundExRate\?\:") {
    Write-Host "X dialog missing setRefundExRate prop" -ForegroundColor Red; exit 1
}
if ($dlg -notmatch "ExchangeRateSelector[\s\S]{0,200}fromCurrency=\{refundCurrency\}") {
    Write-Host "X dialog missing the refund-currency ExchangeRateSelector" -ForegroundColor Red; exit 1
}
Write-Host "+ refund dialog renders ExchangeRateSelector for refund currency" -ForegroundColor Green

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($cust -notmatch "setRefundExRate=\{setRefundExRate\}") {
    Write-Host "X customers page does not pass setRefundExRate" -ForegroundColor Red; exit 1
}

$inv = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($inv -notmatch "setRefundExRate=\{setRefundExRate\}") {
    Write-Host "X invoice page does not pass setRefundExRate" -ForegroundColor Red; exit 1
}
Write-Host "+ both call sites forward setRefundExRate" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_222.txt"
    $msgLines = @(
        "feat(customer-refund): v3.74.222 - user picks live/manual rate for the refund currency",
        "",
        "Symmetry with v3.74.201 (banking transfer) and v3.74.214 (invoice",
        "Record Payment). When the refund is in a different currency from",
        "the app base currency, the dialog now exposes the standard",
        "ExchangeRateSelector so the user can choose between the live API",
        "rate and any manual rate stored in /settings/exchange-rates.",
        "Previously the dialog only displayed the auto-fetched rate read-",
        "only — there was no way to override it for this flow even though",
        "every other monetary dialog already supported the choice.",
        "",
        "  components/customers/customer-refund-dialog.tsx",
        "    - New optional prop setRefundExRate (callback the parent uses",
        "      to receive the user's rate + rateId + source).",
        "    - The read-only Exchange Rate row was replaced with an",
        "      ExchangeRateSelector when setRefundExRate is provided;",
        "      legacy callers without the prop keep the old display.",
        "    - The base-amount preview underneath still recomputes from",
        "      refundAmount × refundExRate.rate so it tracks the chosen",
        "      rate.",
        "",
        "  app/customers/page.tsx",
        "  app/invoices/[id]/page.tsx",
        "    - Both call sites now forward setRefundExRate.",
        "",
        "  lib/version.ts -> 3.74.222",
        "",
        "The parent's auto-fetch useEffect still seeds the initial rate from",
        "getExchangeRate (API) whenever refundCurrency / companyId /",
        "appCurrency change. Once that initial fetch lands, the selector's",
        "own auto-select picks the API option by default and the user can",
        "switch to manual. Picking manual does NOT trigger the parent",
        "useEffect (its deps haven't changed), so the manual choice stays."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.222 pushed" -ForegroundColor Green
}
