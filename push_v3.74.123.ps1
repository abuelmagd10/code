$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1","push_v3.74.121.ps1","push_v3.74.122.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.123"') { Write-Host "+ 3.74.123" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.123 - hide Apply-to-Invoice on void rows

User caught it: the VOID row still showed the 'Apply to Invoice'
button. A void payment is itself an audit/correction record, so
applying it to an invoice would corrupt the trail (and double-count
the cash side). The previous branch only checked amount sign, so
the VOID (positive amount, no invoice_id) leaked into the regular
payment path.

Action column now classifies in this order:
  1. voids_payment_id is set        → VOID row.
       Show 'تَصحيح / إِلغاء' badge (amber, read-only).
       Edit notes still allowed so an auditor can annotate.
       No Apply to Invoice, no Request correction.
  2. voided_by_payment_id is set    → already-reversed original.
       Show 'مُلغاة بتَصحيح' badge (gray, read-only).
  3. amount < 0                     → credit refund (purple, existing).
  4. otherwise                      → regular payment (Apply to
                                      Invoice + Edit + Request
                                      correction)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.123 pushed" -ForegroundColor Green
}
