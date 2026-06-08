# v3.74.95 - Fix 3 bugs in integrity check functions (DB-only)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.94.ps1") { Remove-Item -LiteralPath "push_v3.74.94.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.95"') { Write-Host "+ APP_VERSION = 3.74.95" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.95" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.95]')) { Write-Host "+ CHANGELOG 3.74.95" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.95" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (DB-only release) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(governance): v3.74.95 - 3 bugs in integrity checks uncovered on production data

v3.74.94 went live; owner dashboard surfaced 3 findings on the test
company. All 3 were bugs in the check functions, not real divergences.

1. perm_shares_expired - used from_user_id/to_user_id, actual schema
   has grantor_user_id/grantee_user_id. Function raised an exception
   which the framework correctly caught and surfaced as a finding.

2. payment_double_allocation - was a false positive. Having both
   payments.invoice_id AND an advance_applications row for the same
   (payment, invoice) is a legitimate v3.23.1 pattern (the AA row
   mirrors the link). Rewrote to detect real double-count:
   paid_amount exceeds GREATEST(payment_sum, aa_sum) + 0.50.

3. accounting_equation - missed account_type='income'. The CASE listed
   ('equity','revenue','expense') but this schema uses 'income' (not
   'revenue') for sales revenue accounts. The 50 EGP diff was the
   missed revenue. Added 'income' to the list.

After all 3 fixes: run_all_integrity_checks on the test company
returns zero rows. Widget silent.

Process lesson: empty-on-test != correct. Functions need exercising
against fixtures with realistic data in every referenced column.

DB-only release. No application changes." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.95 pushed" -ForegroundColor Green
}
