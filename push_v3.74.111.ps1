$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.110.ps1") { Remove-Item -LiteralPath "push_v3.74.110.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.111"') { Write-Host "+ 3.74.111" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(payments): v3.74.111 - Edit notes truly limited to notes/reference

The 'Edit notes' dialog was advertising a notes-level scope but the
form still let the user rewrite payment_date, payment_method and the
cash/bank account. Any of those silently rewrites the GL and the
balance on a different account, which is exactly the kind of change
the new Request correction workflow exists to handle.

UI:
- Lock payment_date, payment_method and account_id inputs (disabled
  + readOnly with a greyed-out cursor cue)
- Renamed the dialog title to 'Edit Payment Notes' / 'تَعديل ملاحظات
  الدَّفعَة'
- Replaced the conflicting footer hints with a single amber notice
  pointing at Request correction for any locked change

Submit handler (defense in depth):
- supplier + customer payment update bodies now send the ORIGINAL
  payment.payment_date / payment_method / account_id from
  editingPayment, never from editFields, so a DevTools tweak on the
  disabled inputs cannot escape the lock" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.111 pushed" -ForegroundColor Green
}
