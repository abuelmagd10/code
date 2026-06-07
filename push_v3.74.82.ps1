# v3.74.82 - Fix 400 on warehouse-approve: ambiguous FK to sales_orders
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.82"') { Write-Host "+ APP_VERSION = 3.74.82" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.82" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.82]')) { Write-Host "+ CHANGELOG 3.74.82" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.82" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
$lineCount = ($svc -split "`n").Count
if ($lineCount -ge 1025) { Write-Host "+ accounting-transaction-service.ts intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X accounting-transaction-service.ts truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($svc.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($svc -match 'sales_orders!invoices_sales_order_id_fkey') {
    Write-Host "+ explicit FK in place" -ForegroundColor Green
} else { Write-Host "X explicit FK not found" -ForegroundColor Red; exit 1 }

if ($svc -match 'sales_orders!left') {
    Write-Host "X stale sales_orders!left still present" -ForegroundColor Red; exit 1
} else { Write-Host "+ stale !left removed" -ForegroundColor Green }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "accounting-transaction-service\.ts").Count
if ($err -eq 0) { Write-Host "+ 0 errors" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "accounting-transaction-service\.ts" | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(warehouse-approve): v3.74.82 - resolve ambiguous FK to sales_orders

Warehouse manager couldn't approve INV-00005 dispatch - endpoint returned
400 with PostgREST message: 'Could not embed because more than one
relationship was found for invoices and sales_orders.'

DB has two FKs between the tables:
- invoices_sales_order_id_fkey (the original, invoices.sales_order_id ->
  sales_orders.id)
- sales_orders_invoice_id_fkey (added later, reverse direction)

The select in approveSalesDeliveryAtomic used sales_orders!left (...) -
PostgREST couldn't pick which FK to embed through and rejected the request.
Pre-check, FIFO, account 2155 - all clean. The block was pure FK ambiguity.

Fix: name the FK explicitly. sales_orders!left becomes
sales_orders!invoices_sales_order_id_fkey - the forward relationship we
actually want.

Edit tool truncated the tail on first attempt; restored from HEAD and
re-applied just the FK rename via heredoc. TypeScript: 0 errors." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.82 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.81.ps1') { Remove-Item -LiteralPath 'push_v3.74.81.ps1' -Force }
}
