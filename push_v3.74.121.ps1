$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.121"') { Write-Host "+ 3.74.121" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(customers): v3.74.121 - include partially_used credits in available balance

User reported that after correcting a customer credit refund the
/customers page still showed 0 available credit even though the
customer_credit_ledger had restored 5. Drilling in: the credit row
status is partially_used (5 of 10 applied to INV-00005, the other 5
should be available), but the available-balance loop in
/app/customers/page.tsx filtered strictly on status='active' and
dropped partially_used rows entirely. So the badge displayed
'available = 0' for every credit that had ever been partially
consumed - a long-standing bug surfaced by the correction test.

Fix: include status='partially_used' in the eligibility check. The
Math.max already clamps available to 0, so rows with no remaining
balance are still correctly excluded. Status semantics:
  active           → full amount remains
  partially_used   → part applied/used, remainder available
  used / expired   → nothing available

Bundles together the v3.74.117-120 DB-side fixes (already deployed
via migrations) that hardened execute_payment_correction:
  - handle original payment without journal_entry_id (synthetic
    backfill rows from v3.74.103)
  - skip void payments in the no-journal integrity check
  - mirror ALL customer_credit_ledger linkages back, not only
    payment_method='customer_credit'
  - roll back customer_credits.used_amount when correcting a
    cashed-out refund, so the 💸 disbursed badge tracks reality." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.121 pushed" -ForegroundColor Green
}
