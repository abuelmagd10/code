# v3.74.6 hotfix - customer "—" + DataTable styling consistency
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.6"') { Write-Host "+ APP_VERSION = 3.74.6" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.6" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.6\]') { Write-Host "+ CHANGELOG entry for 3.74.6 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.6 entry" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw

if ($pg -match 'const pluck = ' -and $pg -match 'Array\.isArray\(rel\)') {
    Write-Host "+ defensive plucker for Supabase nested joins present" -ForegroundColor Green
} else { Write-Host "X plucker helper missing" -ForegroundColor Red; exit 1 }

# Explicit FK aliasing must be in the SELECT (forces PostgREST to use the named FK)
if ($pg -match 'customers:customer_id' -and $pg -match 'warehouses:warehouse_id') {
    Write-Host "+ explicit FK-column aliases in SELECT" -ForegroundColor Green
} else { Write-Host "X explicit FK aliases missing" -ForegroundColor Red; exit 1 }

# Columns must use the DataTable built-in type/align (look for `type: "number"` on quantity and `type: "date"` on date)
if ($pg -match 'type: "number"' -and $pg -match 'type: "date"' -and $pg -match 'type: "actions"') {
    Write-Host "+ DataTable type system used (number/date/actions)" -ForegroundColor Green
} else { Write-Host "X DataTable type system not applied" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/inventory/dispatch-approvals/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(approvals): v3.74.6 - customer '—' + table styling consistency

After v3.74.5 Ahmed saw two issues:
  1. Customer column was always '—' even for invoices that
     clearly have a customer (DB confirmed: INV-00004 ->
     محمد بسيونى)
  2. Header/row formatting did not match other tables in the
     project

Root cause of '—':
  Supabase select('customers (name)') returns the nested
  relation as either object or array depending on TS inference.
  Row-builder read inv.customers?.name directly, which returns
  undefined when the runtime shape is [{name: '...'}], so the
  column fell back to '—'. Same issue affected warehouse,
  branch, shipping, and product name.

Fix:
  Added a defensive plucker:
    pluck(rel, field) handles both object and array shapes
  Used for customers, warehouses, branches, shipping_providers,
  and products in invoice_items.

Styling rewritten to match project standard:
  Replaced custom div-based formats with the DataTable's
  built-in type + align system used by /customers,
  /sales-orders, etc:
    - text columns: standard cell rendering
    - date column: type=date for right-align + table formatting
    - number column (quantity): type=number for right-align
    - actions column: type=actions for center-align
  Custom whitespace-nowrap / text-gray-600 / flex helpers
  removed - the DataTable wrapper applies them consistently.

Verify:
  - Customer column shows real names instead of '—'
  - Headers and alignment match /customers and /sales-orders
  - Quantity right-aligned, action centered automatically
  - Dark mode and hover states match other tables

Files:
  Modified: app/inventory/dispatch-approvals/page.tsx
  Modified: lib/version.ts (3.74.5 -> 3.74.6)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.6 pushed" -ForegroundColor Green
}
