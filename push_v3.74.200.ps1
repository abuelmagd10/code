$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.199.ps1") { Remove-Item -LiteralPath "push_v3.74.199.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.200"') {
    Write-Host "+ 3.74.200" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($cust -notmatch "original_currency") {
    Write-Host "X customers page not pulling original_currency for accounts" -ForegroundColor Red; exit 1
}
Write-Host "+ customers page pulls original_currency" -ForegroundColor Green

$dlg = Get-Content -LiteralPath "components/customers/customer-refund-dialog.tsx" -Raw
if ($dlg -notmatch "ExchangeRateSelector") {
    Write-Host "X dialog missing ExchangeRateSelector" -ForegroundColor Red; exit 1
}
if ($dlg -notmatch "accountFxRate") {
    Write-Host "X dialog missing accountFxRate state" -ForegroundColor Red; exit 1
}
if ($dlg -notmatch "accountNativeAmount") {
    Write-Host "X dialog missing accountNativeAmount" -ForegroundColor Red; exit 1
}
Write-Host "+ refund dialog wired with FX picker + native amount" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -notmatch "callerProvidedAccountFx") {
    Write-Host "X service missing accountFx branching" -ForegroundColor Red; exit 1
}
if ($svc -notmatch "accountCurrency\?\:") {
    Write-Host "X service command type missing accountCurrency" -ForegroundColor Red; exit 1
}
Write-Host "+ service handles account FX" -ForegroundColor Green

foreach ($f in @("app/api/customers/refunds/route.ts", "app/api/customers/refund-requests/route.ts", "app/api/customers/refund-requests/[id]/approve/route.ts")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "accountCurrency|account_currency") {
        Write-Host "X $f missing accountCurrency wiring" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all 3 API endpoints carry the FX fields" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_200.txt"
    $msgLines = @(
        "feat(customer-refund): v3.74.200 - currency-aware account picker + FX conversion",
        "",
        "Closes the cross-currency footgun the user flagged after v3.74.199:",
        "selecting a USD bank account for an EGP refund produced a JE that",
        "claimed USD on the cash line but stored the EGP amount with rate 1.",
        "Two-layer defence:",
        "",
        "  FRONT-END (components/customers/customer-refund-dialog.tsx)",
        "    1. Account picker filters to accounts whose original_currency",
        "       matches the chosen refund currency. The match-only behaviour",
        "       keeps the happy path obvious.",
        "    2. If no account in the refund currency exists in the branch,",
        "       the picker falls back to showing every cash/bank account",
        "       and surfaces an amber notice that FX conversion will apply.",
        "       Cross-currency accounts get a [USD] suffix in the dropdown.",
        "    3. When the chosen account differs from the refund currency,",
        "       the dialog renders the standard ExchangeRateSelector (same",
        "       picker payments / sales orders / expenses use) for",
        "       AccountCurrency -> BaseCurrency. The user picks between the",
        "       live API rate and a manual override.",
        "    4. The dialog shows a preview: ~0.06 USD (equivalent to 3.00 EGP)",
        "       so the accountant sees the converted amount BEFORE confirming.",
        "",
        "  BACK-END (service + API)",
        "    1. CustomerRefundCommand grows accountCurrency / accountFxRate /",
        "       accountFxRateId / accountFxSource / accountNativeAmount.",
        "       Optional - the legacy fallback (cash line in base, rate 1)",
        "       stays in place for callers that don't know the FX yet.",
        "    2. customer-refund-command.service.ts uses callerProvidedAccountFx",
        "       to write the cash JE line in the account's native currency",
        "       with the correct rate. The bank ledger now reads accurately",
        "       in its own currency.",
        "    3. All three API endpoints carry the new fields:",
        "         POST /api/customers/refunds (privileged immediate)",
        "         POST /api/customers/refund-requests (non-privileged - persists",
        "                                              FX snapshot in metadata)",
        "         POST /api/customers/refund-requests/[id]/approve (reads the",
        "                                                            metadata back)",
        "",
        "  CHANGES",
        "    app/customers/page.tsx                              (pull original_currency)",
        "    components/customers/customer-refund-dialog.tsx     (currency-aware picker)",
        "    lib/services/customer-refund-command.service.ts     (FX-aware cash line)",
        "    app/api/customers/refunds/route.ts                  (pass FX through)",
        "    app/api/customers/refund-requests/route.ts          (persist FX in metadata)",
        "    app/api/customers/refund-requests/[id]/approve/route.ts (restore FX on approve)",
        "    lib/version.ts                                      (-> 3.74.200)"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.200 pushed" -ForegroundColor Green
}
