$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1","push_v3.74.121.ps1","push_v3.74.122.ps1","push_v3.74.123.ps1","push_v3.74.124.ps1","push_v3.74.125.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.126"') { Write-Host "+ 3.74.126" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(payments): v3.74.126 - port customer-side governance to supplier rows

User asked to mirror the customer-payments treatment onto the supplier
side of /payments. This release covers the Level-1 UI parity items —
nothing requires DB schema changes; the correction WORKFLOW for
suppliers is still planned for a later release (Level 2) and will need
a vendor_payment_correction_requests parallel.

What changed in the supplier table:

1. Linked Supplier Bill column — was a binary 'bill link OR Not linked'.
   Now classifies each row in the same order we use on the customer
   side so a VOID row never looks orphan again:
     a) p.bill_id     → blue link to /bills/<id>
     b) voids_payment_id → trace to the original supplier payment:
          - original had a bill: 'تَصحيح دَفعَة على BILL-N' + link
          - original was a negative refund: 'تَصحيح صَرف لِمُورِّد'
          - original not in the loaded set: 'تَصحيح دَفعَة'
     c) negative amount, no bill: 'صَرف رَصيد المُورِّد' (purple) with
        '(من BILL-N)' suffix if the notes mention a source bill
     d) catch-all: 'Not linked' but with notes as tooltip

2. Action column — VOID and voided-original rows used to keep showing
   Apply to Bill / Apply to PO / Delete, which would corrupt the audit
   trail. Now:
     - voids_payment_id row: read-only amber 'تَصحيح / إِلغاء' badge
       + Edit notes only (auditor can annotate).
     - voided_by_payment_id row: read-only gray 'مُلغاة بتَصحيح' badge.
     - normal row: unchanged (Apply to Bill, Apply to PO, Edit, Delete,
       Approve/Reject).

3. The Edit-notes dialog already locks date/method/account from
   v3.74.111 (this section uses the same editingPayment state as the
   customer side), so supplier Edit is also limited to notes +
   reference without any extra work.

PaymentDetailsModal already supports supplier_id since v3.74.124, so
'View Details' on a supplier row works correctly out of the box.

No DB changes." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.126 pushed" -ForegroundColor Green
}
