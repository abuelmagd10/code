$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.145.ps1") { Remove-Item -LiteralPath "push_v3.74.145.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.146"') { Write-Host "+ 3.74.146" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.146 - show bill link from payment_allocations on /payments

User report: accountant linked a vendor payment to BILL-0002 via the
'اختيار' button on the form's bill table, but the new row on
/payments still showed 'غير مرتبط' for both 'فاتورة المورد المرتبطة'
and 'أمر الشراء المرتبط'.

The link DID land correctly:
  payments.bill_id            = NULL
  payment_allocations.bill_id = BILL-0002 (allocated_amount=3)

The vendor payment API stores the link in payment_allocations (which
supports multi-bill allocations), but the supplier-payments table on
/payments only inspected payments.bill_id when rendering the linked-
bill column. So a row was 'linked from the bookkeeping point of view'
(BILL-0002.paid_amount went up correctly, AP went down correctly) but
'unlinked from the user point of view'.

Fix in app/payments/page.tsx:

  - New state allocBillByPayment: Record<paymentId, billId>.
  - The existing useEffect that loads bill metadata already queried
    payment_allocations to discover allocation bill_ids; we now also
    save a per-payment lookup table at the same time.
  - The 'فاتورة المورد المرتبطة' column resolves the bill id as:
      payments.bill_id  ??  allocBillByPayment[payment.id]
    so the link shows for allocation-only payments too.
  - The 'أمر الشراء المرتبط' column uses the same resolved bill id
    when chaining through billToPoMap.

No DB or API changes were needed - the data was always there, the
table just wasn't reading it.

Manual data fix: none. The in-flight 3 EGP payment now renders
correctly as a link to BILL-0002 with PO-0002 in the next column." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.146 pushed" -ForegroundColor Green
}
