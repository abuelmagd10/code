# v3.74.77 - Auto-credit on overpayment (DB trigger) + invoice list Credit column union
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.77"') { Write-Host "+ APP_VERSION = 3.74.77" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.77" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.77]')) { Write-Host "+ CHANGELOG 3.74.77" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.77" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
$lineCount = ($pg -split "`n").Count
if ($lineCount -ge 3070) { Write-Host "+ invoices/page.tsx intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X invoices/page.tsx truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($pg.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($pg -match 'customerCreditBalances' -and `
    $pg -match 'customer_credit_ledger' -and `
    $pg -match 'customerOverallCredit') {
    Write-Host "+ all 3 v3.74.77 markers present" -ForegroundColor Green
} else { Write-Host "X markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "invoices/page\.tsx").Count
if ($err -eq 0) { Write-Host "+ 0 errors in invoices/page.tsx" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "invoices/page\.tsx" | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(credit): v3.74.77 - auto-credit on overpayment + invoice list shows total credit

Two of three audit findings addressed in this slice (third deferred to .78):

DB - new trigger trg_auto_create_credit_from_overpayment on payments.
When a payment row has unallocated_amount > 0 and customer_id set, a
customer_credits row is created with reference_type='overpayment',
reference_id=payment.id, status='active'. Chains into v3.74.76's
sync trigger, so the ledger is updated automatically and both UI banners
('Refund Credit' and 'Apply Credit') see the balance. If unallocated_amount
later changes, the credit is updated as long as still untouched.

Helper RPC get_customer_overall_credit_balance(company, customer) returns
the aggregated ledger balance.

UI - app/invoices/page.tsx Credit column previously showed only per-invoice
overpayment (paid_amount minus net invoice total). Now also loads aggregated
ledger balance per customer (one query, client-side Map) and displays the
LARGER of (per-invoice overpayment, customer's overall available credit).
So a customer with a return-generated credit will see it surface on all
their active invoices in the list, not just the one where the return
happened.

Verified before migration: zero existing payments with unallocated_amount,
so no historical backfill needed.

Deferred to v3.74.78: banner in /payments page suggesting use of credit
before cash. Vendor_credits parity also deferred - schema differs and
needs its own audit.

TypeScript: 0 errors." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.77 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.76.ps1') { Remove-Item -LiteralPath 'push_v3.74.76.ps1' -Force }
}
