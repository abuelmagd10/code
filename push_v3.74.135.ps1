$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.134.ps1") { Remove-Item -LiteralPath "push_v3.74.134.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.135"') { Write-Host "+ 3.74.135" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(integrity): v3.74.135 - ic_ap_balance excludes pre-GL bill statuses

Dashboard alert the user saw: 'توازُن الذِّمَم الدائنَة - الفَرق: 4'.

Root cause: ic_ap_balance was filtering bills with
COALESCE(status,'') NOT IN ('draft','cancelled'). Everything else was
treated as outstanding AP. But in our P2P cycle the AP journal entry
is only posted at confirm-receipt (status -> 'received'). Bills in
pending_approval / sent / rejected / voided have no JE yet, so they
must not appear in the AP subledger that we compare against the
2110 GL net.

Concrete trigger: BILL-0002 was sitting in 'pending_approval' (the
v3.74.132 trigger flipped it there when the accountant edited the
draft, waiting on owner re-approval). The check counted its 4 EGP
as outstanding AP, but account 2110 net was 0 because no JE existed
for it. -> -4 diff -> medium-severity alert.

Migration v3_74_135_ic_ap_balance_exclude_pre_gl_statuses replaces
ic_ap_balance so the bill side counts only the statuses that have
crossed the GL boundary: received / partially_paid / paid /
partially_returned / fully_returned. Everything before warehouse
confirmation is excluded.

Also cleared the stored alert from system_integrity_alerts so the
dashboard widget refreshes without the user having to wait for the
next cron run. No app-code changes." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.135 pushed" -ForegroundColor Green
}
