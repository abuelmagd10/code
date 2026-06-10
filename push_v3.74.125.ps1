$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1","push_v3.74.121.ps1","push_v3.74.122.ps1","push_v3.74.123.ps1","push_v3.74.124.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.125"') { Write-Host "+ 3.74.125" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.125 - polish translations + responsive modal sizing

Two follow-ups after the v3.74.124 rewrite landed and got tested live:

1. Translate the rest of the audit-log diff:
   - 'bill_id', 'cost_center_id', 'company_id', 'created_by',
     'approved_by', 'is_deleted', 'journal_entry_id' now read as
     'فاتورَة المُورِّد', 'مَركَز التَّكلِفَة', 'الشَّركَة', etc.
   - status values like 'approved' / 'voided' now render via the
     same statusLabel() helper, so the diff says 'مُعتَمَدَة' and
     'مُلغاة بتَصحيح' instead of raw English tokens.
   - payment_method values like 'customer_credit' / 'transfer' now
     render via paymentMethodLabel(), so 'رَصيد العَميل الدائن' and
     'حَوالَة بَنكية' appear in the diff.

2. Responsive sizing — the user reported the modal felt oversized
   on smaller screens and the previous width covered the table.
   - DialogContent now opens at w-[96vw] on mobile (leaves a thin
     margin so the close button and edges stay reachable) and
     centres at max-w-4xl (was 5xl) on sm+ — narrower and easier
     to read.
   - Height: h-[92vh] on mobile, h-[85vh] on sm+.
   - Header / body padding scales (p-4 sm:p-6 / p-3 sm:p-6) so
     content doesn't waste space on small viewports.
   - Title font: text-lg sm:text-2xl. Amount: text-xl sm:text-3xl.
   - Tab strip: smaller gaps on mobile (gap-3) and the strip
     becomes horizontally scrollable so all four tabs reach when
     the device is narrow.
   - Audit diff: nowrap field labels, break-words values so long
     notes wrap inside the cell rather than overflowing." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.125 pushed" -ForegroundColor Green
}
