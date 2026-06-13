$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.144.ps1") { Remove-Item -LiteralPath "push_v3.74.144.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.145"') { Write-Host "+ 3.74.145" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.145 - require explicit bill link or advance opt-in

User report during testing: accountant recorded a 3 EGP payment to a
supplier from the /payments page (not from the bill detail page).
The payment list then showed it with 'غير مرتبط' (no bill link) and
'غير مرتبط' for the PO link too, even though there was an unpaid
BILL-0002 from the same supplier that this payment should have
settled. The accountant simply forgot to click the 'Select' button
on the bill table.

The form already shows 'فواتير المورد غير المسددة بالكامل' with a
Select button per row, but picking a bill is optional - so a missed
click silently created an orphan/advance payment.

Fix:

  app/payments/page.tsx
    - New state confirmAdvanceUnlinked.
    - Before submitting a supplier payment, if at least one of the
      supplier's bills has net outstanding > 0 AND the accountant
      didn't pick a bill AND the new opt-in checkbox is off, the save
      is blocked with: 'اختر فاتورة من الجدول أعلاه أو فعّل دفعة
      سُلفة بدون ربط بفاتورة'.
    - Under the bill table, when the situation above is detected, a
      clearly-flagged amber checkbox appears: 'دَفعَة سُلفَة بدون
      ربط بفاتورَة — أُؤَكِّد أَنَّ هذه دَفعَة مُقَدَّمَة للمورد
      ولَيست تَسديداً لفاتورَة قائِمَة.'
    - If the supplier has zero outstanding bills, the form behaves
      as before (advance payment is the obvious intent, no checkbox
      needed).

Outcome: the orphan-vendor-payment class is now impossible without
an explicit, conscious opt-in by the accountant. The new checkbox
also creates a clear audit trail of intent in the request payload's
uiSurface field.

Manual cleanup of the in-flight 2 EGP orphan payment was applied via
service client (the rejected payment cleaned earlier today plus this
one, both removed)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.145 pushed" -ForegroundColor Green
}
