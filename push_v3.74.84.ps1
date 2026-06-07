# v3.74.84 - Add product_id to fifo_lot_consumptions push (warehouse-approve V2 fix)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.84"') { Write-Host "+ APP_VERSION = 3.74.84" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.84" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.84]')) { Write-Host "+ CHANGELOG 3.74.84" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.84" -ForegroundColor Red; exit 1 }

$f = Get-Content -LiteralPath "lib/fifo-engine.ts" -Raw
$lineCount = ($f -split "`n").Count
if ($lineCount -ge 615) { Write-Host "+ fifo-engine.ts intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X fifo-engine.ts truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($f.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($f -match 'product_id: params\.productId,\s*lot_id') {
    Write-Host "+ product_id present in fifoConsumptions push" -ForegroundColor Green
} else {
    Write-Host "X product_id not in fifoConsumptions push" -ForegroundColor Red; exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "fifo-engine\.ts").Count
if ($err -eq 0) { Write-Host "+ 0 errors in fifo-engine.ts" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(warehouse-approve): v3.74.84 - add product_id to fifoConsumptions push

After v3.74.83 unblocked the DIRECT_POST guard, the next attempt surfaced
the real next failure: null value in column 'product_id' of relation
'fifo_lot_consumptions' violates not-null constraint.

lib/fifo-engine.ts:prepareFIFOConsumptionData builds the fifoConsumptions
array that goes straight into approve_sales_delivery_v2. The push had
company_id, lot_id, reference_type, reference_id, quantity_consumed,
unit_cost, total_cost, consumed_at - but no product_id, which the table
declares NOT NULL. The cogsTransactions push two lines below was already
correct, so this was a clean omission.

V1 legacy consume_fifo_lots looks up product_id internally per lot, so V1
never tripped on this. V2 takes pre-built JSON and inserts as-is - no
lookup, no defaults - so the missing field was fatal.

One field added: product_id: params.productId. TypeScript: 0 errors.
File rebuilt via heredoc (Edit truncated on first attempt)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.84 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.83.ps1') { Remove-Item -LiteralPath 'push_v3.74.83.ps1' -Force }
}
