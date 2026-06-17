$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.190.ps1") { Remove-Item -LiteralPath "push_v3.74.190.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.191"') {
    Write-Host "+ 3.74.191" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000191_v3_74_191_vendor_refund_correct_account.sql")) {
    Write-Host "X missing migration" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_191.txt"
    $msgLines = @(
        "fix(accounting): v3.74.191 - vendor refund posts to Vendor Advances not AP",
        "",
        "Symptom: ic_ap_balance flagged a -3 EGP drift on the AP ledger on",
        "2026-06-17. The trail: a supplier refund of 3 EGP (JE-000031) had",
        "credited account 2110 (Accounts Payable) instead of 1180 (سلف",
        "ومقدمات للموردين / Vendor Advances). Because no open bill backed",
        "that credit, the AP-vs-bills integrity check correctly raised the",
        "deviation.",
        "",
        "Root cause: approve_vendor_refund_request looked up the Vendor",
        "Advances account first by sub_type, then by the name pattern",
        "'%سلف الموردين%'. The Egyptian-Arabic name 'سلف ومقدمات للموردين'",
        "has a connector word and a prefix that the pattern did not allow,",
        "so the lookup fell through to a third fallback that silently",
        "picked accounts_payable. The refund then credited AP, not the",
        "asset account.",
        "",
        "Fix:",
        "  * Broaden the name match: '%سلف%مورد%', '%مقدمات%مورد%' and",
        "    English variants.",
        "  * Lookup by account_code (1180 / 1230 / 1240) before falling",
        "    through to the name match — code is stable, names are not.",
        "  * REMOVE the AP fallback. Silently turning an Asset settlement",
        "    into an AP credit is exactly what produced this drift. If the",
        "    chart is misconfigured we now fail with a clear message.",
        "",
        "Corrective JE: a one-off audit_correction was posted at deploy",
        "time moving the 3 EGP from 2110 to 1180. ic_ap_balance is clean.",
        "",
        "Files:",
        "  supabase/migrations/20260617000191_v3_74_191_vendor_refund_correct_account.sql",
        "  lib/version.ts"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.191 pushed" -ForegroundColor Green
}
