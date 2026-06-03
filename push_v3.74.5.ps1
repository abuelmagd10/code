# v3.74.5 - Dispatch-approvals 8-column rich table
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.5"') { Write-Host "+ APP_VERSION = 3.74.5" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.5" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.5\]') { Write-Host "+ CHANGELOG entry for 3.74.5 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.5 entry" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw

# UnifiedRow must have the new split fields
if ($pg -match 'customer: string' -and $pg -match 'product: string' -and $pg -match 'quantity: number' -and $pg -match 'branch: string' -and $pg -match 'shipping: string') {
    Write-Host "+ UnifiedRow split into 6 fields" -ForegroundColor Green
} else { Write-Host "X UnifiedRow split incomplete" -ForegroundColor Red; exit 1 }

# Columns array must have الكمية + المنتج as separate columns
if ($pg -match 'الكمية' -and $pg -match '"المنتج"' -and $pg -match '"العميل"') {
    Write-Host "+ 8-column headers present" -ForegroundColor Green
} else { Write-Host "X 8-column headers missing" -ForegroundColor Red; exit 1 }

# Old combined headers must be GONE
if ($pg -notmatch 'العميل / المنتج' -and $pg -notmatch 'شركة الشحن / الفرع') {
    Write-Host "+ old combined headers removed" -ForegroundColor Green
} else { Write-Host "X old combined headers still present" -ForegroundColor Red; exit 1 }

# Items summary must aggregate quantity and product name
if ($pg -match 'itemSummaries' -and $pg -match 'totalQty') {
    Write-Host "+ items summary aggregation wired" -ForegroundColor Green
} else { Write-Host "X items summary missing" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(approvals): v3.74.5 - 8-column rich layout on dispatch-approvals

v3.74.4 patched the warehouse cell, but the layout was still
cramped: customer + product squeezed into one column, branch
glued to shipping, no quantity at all. Ahmed asked for a proper
8-column layout with each field on its own.

Done:

Table layout - 8 data columns + actions (Type column dropped;
icon moved inline before the reference to save space):
  reference - invoice_number (page icon) or order_no (factory icon)
  date      - invoice_date or requested_at
  customer  - customer.name (sales) or em-dash (manufacturing)
  product   - first item product +N more (sales) | production
              product (manufacturing) - truncated 180px with title
  quantity  - sum of invoice items.quantity (sales) | planned
              quantity + UoM (manufacturing)
  branch    - branches.name (own column now, was combined)
  warehouse - warehouses.name with box icon
  shipping  - shipping_providers.provider_name or em-dash

Data layer:
  - Replaced items-count-only query with per-invoice summary
    pulling count + totalQty + firstProduct from
    invoice_items joined to products(name). One round trip,
    three useful aggregates.
  - Kept itemsCounts derived from new summary for compatibility.
  - UnifiedRow shape: party + extra (combined) replaced with
    customer + product + quantity + uom + branch + shipping.

Search:
  Filter now matches across all six display fields, not just
  reference + party. Product name search works now.

HistoryRow left alone:
  History tab uses its own interface, intentionally untouched.
  Same treatment there is an easy follow-up if wanted.

Verify:
  - Header: الرقم المرجعى . التاريخ . العميل . المنتج . الكمية
    . الفرع . المخزن . شركة الشحن . إجراء
  - Sales rows: customer name, first product +N, total qty,
    branch, warehouse with box icon, shipping or em-dash
  - Mfg rows: em-dash customer, product, planned qty + UoM,
    branch, warehouse, em-dash shipping
  - Type icon inline at start of reference cell

Files:
  Modified: app/inventory/dispatch-approvals/page.tsx
  Modified: lib/version.ts (3.74.4 -> 3.74.5)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.5 pushed" -ForegroundColor Green
}
