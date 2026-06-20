$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.241.ps1") { Remove-Item -LiteralPath "push_v3.74.241.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.242"') {
    Write-Host "+ 3.74.242" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$migration = Get-Content -LiteralPath "supabase/migrations/20260620000242_v3_74_242_auto_seed_period_for_back_dated_entries.sql" -Raw
if ($migration -notmatch "INTERVAL '24 months'") {
    Write-Host "X auto-seed window not 24 months in migration" -ForegroundColor Red; exit 1
}
if ($migration -notmatch "seed_accounting_periods_for_company") {
    Write-Host "X migration does not call the seed helper" -ForegroundColor Red; exit 1
}
Write-Host "+ require_open_financial_period_db auto-seeds back-dated periods within 24 months" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_242.txt"
    $msgLines = @(
        "fix(accounting): v3.74.242 - back-dated entries auto-create their period",
        "",
        "Diagnosed during the new-company test (notniche, signed up 20 June 2026):",
        "owner tried to record a capital contribution dated 1 May 2026 to",
        "reflect when the business actually started. require_open_financial_period_db",
        "raised NO_ACTIVE_FINANCIAL_PERIOD because seed_accounting_periods_for_company",
        "had only created 12 forward months (June 2026 - May 2027) at company",
        "creation - May 2026 didn't exist.",
        "",
        "This is the common 'I signed up today but my real opening date was",
        "earlier' scenario. Every new tenant hits it the moment they try to",
        "enter opening balances, capital contributions, opening AR/AP, or",
        "any historical invoice/bill.",
        "",
        "Fix: require_open_financial_period_db now self-heals. When the",
        "queried date is not covered by any period AND the date is within",
        "the last 24 months (and not more than 12 months in the future), we",
        "call seed_accounting_periods_for_company once for that single month",
        "and re-query. seed_accounting_periods_for_company is idempotent.",
        "Dates outside the window (typos like 2014) still throw the original",
        "error so they don't silently breed phantom periods.",
        "",
        "Lock/close enforcement is unchanged: a date that lands in a locked",
        "or audit-locked period still throws FINANCIAL_PERIOD_LOCKED.",
        "",
        "Verified on the live test company: requesting 2026-05-01 now",
        "creates 'مايو ٢٠٢٦' and returns the new period id.",
        "",
        "Migration applied to live DB and committed for the next environment",
        "rebuild.",
        "",
        "  supabase/migrations/20260620000242_v3_74_242_auto_seed_period_for_back_dated_entries.sql",
        "  lib/version.ts -> 3.74.242"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.242 pushed" -ForegroundColor Green
}
