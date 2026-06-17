$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.200.ps1") { Remove-Item -LiteralPath "push_v3.74.200.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.201"') {
    Write-Host "+ 3.74.201" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/banking/page.tsx" -Raw
if ($page -notmatch "accountFxRate") { Write-Host "X banking page missing accountFxRate" -ForegroundColor Red; exit 1 }
if ($page -notmatch "تَحويل عُملَة الحِساب") { Write-Host "X banking page missing FX banner" -ForegroundColor Red; exit 1 }
Write-Host "+ banking page wired with account FX picker" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/banking/transfers/route.ts" -Raw
if ($api -notmatch "accountFxRate") { Write-Host "X banking API missing accountFxRate" -ForegroundColor Red; exit 1 }
Write-Host "+ banking API carries accountFxRate" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/services/bank-transfer-command.service.ts" -Raw
if ($svc -notmatch "callerAccountFx") { Write-Host "X service missing callerAccountFx branch" -ForegroundColor Red; exit 1 }
if ($svc -notmatch "accountFxRate\?\:") { Write-Host "X service command type missing accountFxRate" -ForegroundColor Red; exit 1 }
Write-Host "+ service prefers caller-supplied rate over silent lookup" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_201.txt"
    $msgLines = @(
        "feat(banking): v3.74.201 - user picks FX rate when transferring to a foreign-currency account",
        "",
        "Reported by the user: transferring EGP -> USD bank account silently",
        "used the live API rate with no user prompt, while transferring USD ->",
        "EGP (the reverse) already showed the live/manual rate picker. The",
        "asymmetry is because the existing ExchangeRateSelector was gated on",
        "transfer.currency != appCurrency: only the foreign-transfer-currency",
        "case got the picker.",
        "",
        "Fix:",
        "  app/banking/page.tsx",
        "    - Detect when the chosen from/to account is in a foreign currency",
        "      that differs from the transfer currency (the case the service",
        "      would have silently resolved).",
        "    - Render a second ExchangeRateSelector for that account-currency",
        "      conversion (AccountCcy -> Base), inside an amber FX panel that",
        "      tells the user what is being converted. Live/manual choice is",
        "      identical to the existing picker.",
        "    - Show a preview of what will land in the foreign account.",
        "    - Submit accountFxRate / accountFxRateId / accountFxSource to the",
        "      API so the service has the explicit choice.",
        "",
        "  app/api/banking/transfers/route.ts",
        "    - Pass-through fields onto the BankTransferCommand.",
        "",
        "  lib/services/bank-transfer-command.service.ts",
        "    - resolveNativeAmount: when an account is in a foreign currency,",
        "      prefer the caller-supplied accountFxRate; only fall through to",
        "      the silent getExchangeRate path for legacy callers that didn't",
        "      send a rate. Each JE line now carries its own exchange_rate_id",
        "      so the GL audit trail reflects the actual conversion behind",
        "      each account, not just the transfer-currency rate.",
        "",
        "lib/version.ts -> 3.74.201."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.201 pushed" -ForegroundColor Green
}
