$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.184.ps1") { Remove-Item -LiteralPath "push_v3.74.184.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.185"') { Write-Host "+ 3.74.185" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/customer-refund-requests/page.tsx" -Raw
if ($page -notmatch "r.currency \|\| 'EGP'") {
    Write-Host "X currency-aware symbol logic missing" -ForegroundColor Red
    exit 1
}
if ($page -match "<DollarSign className=`"w-3.5 h-3.5`" />") {
    Write-Host "X hard-coded DollarSign icon still present in amount column" -ForegroundColor Red
    exit 1
}
Write-Host "+ amount column renders the row's actual currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_185.txt"
    $msgLines = @(
        "fix(customer-refunds): v3.74.185 - amount column shows the row's currency, not a hard-coded \$",
        "",
        "Tester report on /customer-refund-requests: the pending row for",
        "محمد بسيونى shows '\$ 3' even though the credit refund was filed",
        "in EGP. The DollarSign icon was a fixed lucide-react component",
        "rendered next to every amount regardless of currency.",
        "",
        "Fix:",
        "  app/customer-refund-requests/page.tsx",
        "    - SELECT now pulls the currency column (added to the table in",
        "      v3.74.183).",
        "    - The Request interface gains an optional currency field and",
        "      also picks up 'rejected' in the status union (also added in",
        "      v3.74.183).",
        "    - Amount column format() maps the row's currency code to its",
        "      symbol: EGP/GBP -> £, USD -> \$, EUR -> ?, SAR -> Riyal,",
        "      AED -> ?.?., others fall through to the code itself.",
        "      Falls back to EGP for legacy payment_correction rows that",
        "      pre-date the currency column.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.185.",
        "",
        "How to verify:",
        "  - Sign in, open /customer-refund-requests. The pending row for",
        "    محمد بسيونى now reads '£ 3' (EGP). Filing a USD refund",
        "    would render '\$ 3'."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.185 pushed" -ForegroundColor Green
}
