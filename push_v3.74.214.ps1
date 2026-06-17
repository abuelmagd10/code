$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.212.ps1") { Remove-Item -LiteralPath "push_v3.74.212.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.214"') {
    Write-Host "+ 3.74.214" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "Currency-aware Account picker") {
    Write-Host "X invoice payment dialog missing currency-aware picker" -ForegroundColor Red; exit 1
}
if ($page -notmatch "effectivePayCcy") {
    Write-Host "X effectivePayCcy logic missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch "original_currency.*chart_of_accounts" -and $page -notmatch "original_currency") {
    Write-Host "X chart_of_accounts SELECT missing original_currency" -ForegroundColor Red; exit 1
}
Write-Host "+ Record-Payment dialog filters accounts by currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_214.txt"
    $msgLines = @(
        "feat(invoice): v3.74.214 - currency-aware Account picker in Record Payment dialog",
        "",
        "Mirrors v3.74.200 (customer-refund dialog) for the invoice's Record",
        "Payment dialog. The user asked for the same behaviour: pay in the",
        "app currency -> only same-currency accounts; pay in a different",
        "currency -> only accounts in that currency, OR fall back to all",
        "accounts with FX conversion notice when no match exists.",
        "",
        "  app/invoices/[id]/page.tsx",
        "    - chart_of_accounts SELECT now pulls original_currency.",
        "    - The Account select computes the effective payment currency",
        "      (invoice FC if the invoice is foreign, else the payment-",
        "      currency selector, else the base currency).",
        "    - Accounts matching that currency are shown alone. If none in",
        "      the branch match, every cash/bank account is shown with an",
        "      amber note explaining the FX conversion will apply. The",
        "      existing FX section underneath already exposes the live /",
        "      manual rate picker for the conversion, so no separate",
        "      mechanism is needed.",
        "    - Cross-currency entries get a [USD] / [EUR] / ... suffix in",
        "      the dropdown label so the operator sees what they are",
        "      picking.",
        "",
        "  lib/version.ts -> 3.74.214"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.214 pushed" -ForegroundColor Green
}
