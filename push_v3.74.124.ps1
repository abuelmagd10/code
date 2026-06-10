$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1","push_v3.74.121.ps1","push_v3.74.122.ps1","push_v3.74.123.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.124"') { Write-Host "+ 3.74.124" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.124 - rewrite Payment Details modal for users

Comprehensive rewrite of components/payments/PaymentDetailsModal.tsx
after a user review found 18 issues. They split into three groups.

BUGS (data was wrong or misleading):
  1. Reference field read 'reference' but the DB column is
     'reference_number' - the field showed '-' even when populated.
  2. Default currency was hardcoded to 'SAR'. System is Egyptian;
     amounts now render with the company's actual base_currency
     (fetched per-payment) and fall back to 'EGP'.
  3. Payment method only labelled cash/transfer. customer_credit,
     check, card, online are now translated. customer_credit was
     showing as 'Bank Transfer' - a real audit hazard.
  4. Status badge supported 4 of 6 real statuses. voided / draft /
     cancelled / pending now have proper colours and Arabic labels.
  5. Audit log dates used ar-SA (Saudi). Switched to ar-EG.
  6. Raw action codes leaked ('PAYMENT_CREATE', 'PAYMENT_APPROVE').
     Now translated to 'إِنشاء الدَّفعَة', 'اعتماد الدَّفعَة', etc.
  7. Audit log dumped raw JSON in 'Old Values' / 'New Values'.
     Replaced with a field-by-field diff: each row shows the field
     name in Arabic, the old value (strike-through), and the new
     value (highlighted). UUIDs collapse to '-'.
  8. Title 'السياق المالى (FX & Allocation)' had English bleed.

MISSING DATA (now shown):
  9. Linked sales invoice or supplier bill (with click-through link).
 10. Branch (subtitle + Transaction Details card).
 11. Payment creator (created_by, resolved to full name).
 12. Date is now a first-class field in the Overview card, not just
     a subtitle.
 13. VOID / Voided badges in the header. For VOID rows, an amber
     callout points at the original payment with its reference and
     amount, so the audit trail is one click away.

LANGUAGE / UX IMPROVEMENTS:
 14. Approval Trail labels now read naturally instead of repeating
     the action code in parentheses.
 15. Audit diff omits identical fields and uuid-only changes.
 16. 'System User' replaced with 'مُستَخدِم غَير مُحَدَّد' /
     'Unknown user'.
 17. The cryptic '#a1b2c3d4' header chip is replaced by the
     payment's reference_number when present.
 18. FX card (rate + base-currency amount) is hidden when there's
     no FX (currency == base AND rate == 1) so a pure EGP payment
     doesn't display noise.

No DB changes. No API changes. Pure modal rewrite." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.124 pushed" -ForegroundColor Green
}
