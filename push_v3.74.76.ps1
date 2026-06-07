# v3.74.76 - DB-only: unify customer credit sources (backfill + trigger + FIFO consume)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.76"') { Write-Host "+ APP_VERSION = 3.74.76" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.76" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.76]')) { Write-Host "+ CHANGELOG 3.74.76" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.76" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (no regressions allowed) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "accounting-transaction-service\.ts|sales-invoice-warehouse-command\.service\.ts|warehouse-approve|version\.ts"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(accounting): v3.74.76 - unify customer credit sources (backfill + trigger + FIFO)

The 'Apply Credit' green banner on invoice pages wasn't appearing for a
customer who clearly had a credit balance (10 EGP from INV-00004 return),
because the banner reads customer_credit_ledger while the credit was only
written to customer_credits. Two UI controls, two sources of truth, no
sync between them.

Three-layer fix in one DB migration:

1. Backfill: every active customer_credits row with remaining balance and
   no matching ledger row (linked by source_id = customer_credits.id) is
   mirrored into customer_credit_ledger now. INV-00005's customer fixed:
   ledger goes from 0 to 10.00.

2. Sync trigger: trg_sync_customer_credit_to_ledger (AFTER INSERT OR
   UPDATE on customer_credits) auto-mirrors new active credits into the
   ledger. Existence-checked by source_id so re-firing doesn't duplicate.
   Maps reference_type to the CHECK-allowed source_type values.

3. FIFO consumption in apply_customer_credit_to_invoice: the v3.74.75
   patch fixed the journal but didn't decrement customer_credits.
   applied_amount. Added a FIFO loop after journal posting - iterates
   active credits oldest-first, locks FOR UPDATE, increments applied_amount,
   flips status='exhausted' when fully consumed. Both sources stay in
   sync after every Apply Credit.

DB-only. App code unchanged.

Verified: get_customer_credit_balance(INV-00005 customer) returns 10.00." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.76 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.75.ps1') { Remove-Item -LiteralPath 'push_v3.74.75.ps1' -Force }
}
