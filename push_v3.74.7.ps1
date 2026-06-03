# v3.74.7 hotfix - customer name visible to warehouse / accountant roles via invoice
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.7"') { Write-Host "+ APP_VERSION = 3.74.7" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.7" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.7\]' -and $cl -match 'customers_select_v5') {
    Write-Host "+ CHANGELOG entry for 3.74.7 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.7 entry" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(rls): v3.74.7 - workflow customer-name access for warehouse / accountant roles

After v3.74.6 owners saw customer name correctly, but the
store_manager (who actually does the dispatch work) still saw '—'.
Same issue for accountant, purchasing_officer,
manufacturing_officer, manager, hr_officer.

Root cause:
  v3.74.0 introduced resource-aware RLS on customers. Per Ahmed's
  strict v3.69.0 spec, store_manager doesn't have 'customers'
  in role permissions, so current_user_resource_visibility
  returns 'none' and the JOIN to customers returns NULL inside
  the invoice query.

Fix:
  Extended customers SELECT RLS with a fifth OR clause:
  operational roles (store_manager / manufacturing_officer /
  purchasing_officer / accountant / manager / hr_officer) get
  visibility on a customer ONLY when an invoice for that customer
  exists in the user's branch.

  Policy renamed customers_select_v4 -> customers_select_v5.

Not a regression:
  - owner / admin unchanged (clause 1)
  - staff (sales rep) unchanged - own only (clause 3)
  - viewer unchanged
  - permission shares unchanged (clause 4)
  - new clause 5 bounded by 'invoice in my branch exists' - users
    cannot enumerate all customers, only those they're working on.

DB verification:
  Simulated store_manager in branch مدينة نصر -> direct visibility
  still 'none', but SELECT name FROM customers returns the name
  via the new workflow clause.

Files:
  DB migration: v3_74_7_customer_visibility_via_invoice_workflow
  Modified: lib/version.ts (3.74.6 -> 3.74.7)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.7 pushed" -ForegroundColor Green
}
