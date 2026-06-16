$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.187.ps1") { Remove-Item -LiteralPath "push_v3.74.187.ps1" -Force }

# Version sanity check.
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.190"') {
    Write-Host "+ 3.74.190" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Confirm the three migration files exist.
$migs = @(
    "supabase/migrations/20260616000188_v3_74_188_customer_credits_multi_currency.sql",
    "supabase/migrations/20260616000189_v3_74_189_vendor_credits_multi_currency.sql",
    "supabase/migrations/20260616000190_v3_74_190_estimates_multi_currency.sql"
)
foreach ($m in $migs) {
    if (-not (Test-Path -LiteralPath $m)) {
        Write-Host "X missing $m" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ 3 migration files present" -ForegroundColor Green

# TypeScript check — nothing in this batch should touch app code, but verify.
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_190.txt"
    $msgLines = @(
        "feat(fx): v3.74.188 + v3.74.189 + v3.74.190 — finish the multi-currency audit",
        "",
        "Closes the audit started in v3.74.186 / v3.74.187. After this commit",
        "every transactional row that affects a balance carries both the base-",
        "currency total (the existing column) and an original-currency snapshot",
        "(original_currency, original_amount/total, exchange_rate_used,",
        "exchange_rate_id). No more silent FX drift on credits.",
        "",
        "v3.74.188 — customer_credits + customer_credit_ledger",
        "  - FX columns + backfill from payments / sales_returns.",
        "  - BEFORE INSERT triggers fill_customer_credit_fx_from_source and",
        "    fill_customer_credit_ledger_fx_from_source auto-stamp the FX",
        "    snapshot, so the five+ procs that INSERT into these tables do",
        "    not need to be edited.",
        "",
        "v3.74.189 — vendor_credits",
        "  - Same shape as v3.74.188 on the supplier side.",
        "  - Trigger prefers purchase_returns (FX-aware since v3.74.171) and",
        "    falls back to bills (currency_code + exchange_rate).",
        "",
        "v3.74.190 — estimates (quotes)",
        "  - currency_code + exchange_rate + exchange_rate_id parallel to",
        "    invoices / sales_orders. Quotes carry no GL impact, but the",
        "    customer is quoted in a specific currency and downstream",
        "    conversion to a sales_order must keep the same intent.",
        "",
        "lib/version.ts",
        "  - Bumped to 3.74.190."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.190 pushed (closes multi-currency audit)" -ForegroundColor Green
}
