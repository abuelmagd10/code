$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.206.ps1") { Remove-Item -LiteralPath "push_v3.74.206.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.207"') {
    Write-Host "+ 3.74.207" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000207_v3_74_207_ic_customer_credit_partial.sql")) {
    Write-Host "X missing migration" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260617000207_v3_74_207_ic_customer_credit_partial.sql" -Raw
if ($mig -notmatch "status IN \('active', 'partially_used'\)") {
    Write-Host "X migration still active-only" -ForegroundColor Red; exit 1
}
Write-Host "+ ic_customer_credit now covers partially_used rows" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_207.txt"
    $msgLines = @(
        "fix(integrity): v3.74.207 - close the 5 EGP customer-credit drift + harden the check",
        "",
        "The dashboard surfaced a high-severity deviation: customer_credits",
        "vs 2155 differed by 5 EGP. Investigation traced it to JE-000021",
        "(an earlier 5 EGP customer-credit refund that posted to the GL),",
        "where customer_credits.used_amount stayed at 0 - the same bug class",
        "v3.74.199 later closed for the refund executor. With the row still",
        "showing 5 EGP available, the system later let through three more",
        "operations (3 EGP refund + 1 EGP and 1 EGP applications) that",
        "should have failed for lack of balance, so the customer effectively",
        "received 5 EGP beyond their actual entitlement.",
        "",
        "  - Posted an audit_correction JE that records the 5 EGP as a loss",
        "    on 5300 (مَصروفات أُخرى) and credits 2155 to restore the",
        "    balance. The customer-side numbers (cash already paid out,",
        "    invoice already partially settled) are kept as-is - this is",
        "    test data and the GL is what needed to reconcile.",
        "",
        "  - Fixed ic_customer_credit itself: it filtered status='active'",
        "    only, so any row mid-consumption (the normal state once any",
        "    credit-applied or credit-refund has run, because the trigger",
        "    flips status to 'partially_used' immediately) was invisible to",
        "    the check and silent drifts could accumulate. Now it scans",
        "    status IN ('active','partially_used').",
        "",
        "  supabase/migrations/20260617000207_v3_74_207_ic_customer_credit_partial.sql",
        "  lib/version.ts -> 3.74.207"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.207 pushed" -ForegroundColor Green
}
