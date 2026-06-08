# v3.74.98 - Hotfix: AR/AP balance checks now exclude FX revaluation journals
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.97.ps1") { Remove-Item -LiteralPath "push_v3.74.97.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.98"') { Write-Host "+ APP_VERSION = 3.74.98" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.98" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.98]')) { Write-Host "+ CHANGELOG 3.74.98" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.98" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (DB-only) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(governance): v3.74.98 - AR/AP balance checks exclude FX revaluation journals

After v3.74.97 deployed, posting one of the stale FX drafts (304.78
EGP, Dr 1130 / Cr 4320) immediately triggered ar_balance with a 304.78
mismatch. False positive - FX revaluation correctly adjusts EGP value
of foreign-currency AR without changing the outstanding invoice list.

Both ic_ar_balance and ic_ap_balance now exclude journals with
reference_type IN ('fx_period_end_revaluation', 'fx_revaluation',
'fx_ar_revaluation', 'fx_ap_revaluation') from the comparison.

The check now reflects the original invoice/bill ledger - which is what
it's supposed to verify. FX revaluation is tracked separately by
fx_draft_stale.

Side action (user-directed): resolved the 2 stale FX drafts:
- Deleted 1c42c116 (311 EGP, older duplicate at 14:14)
- Posted 3f18c4f1 (304.78 EGP, later run with more accurate rate)

Both drafts were duplicates of the same daily revaluation run 95 minutes
apart with different rates. Kept the latest per standard practice.

After hotfix + cleanup: run_all_integrity_checks returns ZERO findings.
All 48 checks still active. Widget silent again.

Lesson captured in changelog: check definitions need to distinguish
between ledger-driving journals (invoices, bills, payments) and
valuation-adjustment journals (FX, depreciation, period-end). When
the next valuation category is added, the same exclusion list will
need it." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.98 pushed" -ForegroundColor Green
}
