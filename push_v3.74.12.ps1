# v3.74.12 - pro-rata bonus clawback on sales returns
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.12"') { Write-Host "+ APP_VERSION = 3.74.12" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.12" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.12\]' -and $cl -match 'bonus-reversal.service' -and $cl -match 'parent_bonus_id') {
    Write-Host "+ CHANGELOG entry for 3.74.12 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.12 entry" -ForegroundColor Red; exit 1 }

# New service file
if (Test-Path -LiteralPath "lib/services/bonus-reversal.service.ts") {
    Write-Host "+ bonus-reversal.service.ts created" -ForegroundColor Green
} else { Write-Host "X bonus-reversal.service.ts missing" -ForegroundColor Red; exit 1 }

$bs = Get-Content -LiteralPath "lib/services/bonus-reversal.service.ts" -Raw
if ($bs -match 'export\s+(async\s+)?function\s+reverseBonusForSalesReturn') {
    Write-Host "+ reverseBonusForSalesReturn exported" -ForegroundColor Green
} else { Write-Host "X export missing" -ForegroundColor Red; exit 1 }

# Hook in warehouse-approve
$wa = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/warehouse-approve/route.ts" -Raw
if ($wa -match 'reverseBonusForSalesReturn' -and $wa -match 'salesReturnRequestId') {
    Write-Host "+ warehouse-approve hook installed" -ForegroundColor Green
} else { Write-Host "X warehouse-approve hook missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        "lib/services/bonus-reversal.service.ts" `
        "app/api/sales-return-requests/[id]/warehouse-approve/route.ts" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(bonus): v3.74.12 - pro-rata clawback on sales returns

Investigation after Ahmed's question revealed that no live code calls
the existing /api/bonuses/reverse endpoint. The only client-side call
was in a legacy comment block. The active sales-return path through
sales-return-requests/[id]/warehouse-approve does ZERO bonus reversal.

Practical impact: salesperson sells 100k -> bonus 5k posts.
Customer returns the entire shipment -> invoice returned_status='full'
but bonus row remains untouched. Salesperson collects on a sale that
didn't happen. Both partial and full returns leak.

Pro-rata clawback model (SAP / Oracle / NetSuite all do this):
  return_ratio  = returned_amount / original_invoice_total
  reverse_each  = bonus_amount * return_ratio

Original bonus row is NEVER modified. Adjustment row (negative amount,
parent_bonus_id link, sales_return_request_id link) is INSERTed so
the bonuses dashboard sums positive + negative for the effective net,
and auditors can trace every clawback to the return that produced it.

Adjustment status mirrors the original's lifecycle:
  pending   -> pending    (nets before payroll touches it)
  scheduled -> scheduled  (same payroll run nets both)
  paid      -> scheduled  (clawback in NEXT payroll - never deduct
                           retroactively from a disbursed salary -
                           Egyptian labor law)

DB migration v3_74_12_bonus_reversal_columns:
  + parent_bonus_id uuid REFERENCES user_bonuses(id) ON DELETE SET NULL
  + sales_return_request_id uuid
  + index on each
  + UNIQUE partial index on (parent_bonus_id, sales_return_request_id)
    WHERE both NOT NULL  ->  idempotency: same return cannot clawback
    same parent twice (insert raises 23505, treated as already processed).

Service lib/services/bonus-reversal.service.ts:
  reverseBonusForSalesReturn({ admin, invoiceId, companyId,
    returnedAmount, originalInvoiceTotal, salesReturnRequestId,
    actorUserId, reason })
  Sums prior clawback rows on the same parent so cumulative reversal
  never exceeds the original amount, even across multiple partial
  returns. Per-row audit log. 23505 short-circuits cleanly.

Hook in app/api/sales-return-requests/[id]/warehouse-approve/route.ts:
  After accountingService.postSalesReturnAtomic succeeds (return is
  committed) and before observability/notifications:
    - Fetch invoice original_total (fallback to total_amount).
    - Call reverseBonusForSalesReturn with request.total_return_amount.
    - Log result; errors caught and logged - never roll back the return.

Files:
  DB:     v3_74_12_bonus_reversal_columns
  New:    lib/services/bonus-reversal.service.ts
  Modified:
    app/api/sales-return-requests/[id]/warehouse-approve/route.ts
    lib/version.ts (3.74.11 -> 3.74.12)
    CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.12 pushed" -ForegroundColor Green
}
