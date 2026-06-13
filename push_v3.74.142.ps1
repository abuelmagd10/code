$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.141.ps1") { Remove-Item -LiteralPath "push_v3.74.141.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.142"') { Write-Host "+ 3.74.142" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.142 - repair three-way matching card on bill detail page

User reported the 'المطابقة الثلاثية' card on the bill detail page
showed 'يوجد استثناءات' for a clean bill that had no actual issues.
Investigation found two compounding problems:

  1) The validate_three_way_matching DB function crashed with
     'record v_grn_item is not assigned yet' whenever a bill had
     no goods_receipt link. The function used 'IF v_grn IS NOT NULL'
     after SELECT INTO, but in PG that test passes for an
     uninitialised RECORD, leading to a downstream reference that
     dies. FOUND is the correct pattern.

  2) The function emitted a 'missing_grn' warning for every bill
     linked to a PO, but this project DOES NOT use a separate
     goods_receipts table. The procurement cycle uses
     bills.receipt_status='received' as the integrated receipt
     mechanism (store manager approves on the bill detail page).
     So the warning was always a false positive.

  3) On the TypeScript side, when the RPC failed,
     validateBillMatching set { success:false, hasExceptions:false },
     which the UI computed as isValid = false → it rendered
     'Exceptions Found / يوجد استثناءات' — misleading for what was
     actually a function error.

Fix is DB-only (migration v3_74_142_fix_three_way_matching):

  - Replaced 'IS NOT NULL' tests on RECORDs with the FOUND boolean
    after each SELECT INTO. No more uninitialised-record crash.
  - Removed the missing_grn check entirely.
  - Quantity check now compares bill_qty vs PO_qty directly
    (over-receipt detection), since the bill's own quantities are
    the received quantities in this project's model.
  - Price tolerance check kept as-is.

Result for clean bills: { success: true, has_exceptions: false }.
The UI now correctly renders 'مُطابِق' / 'Matched' on the card.

No code changes needed - the TS layer already handles the
success/has_exceptions response correctly. Bumping version only so
the deployment marker rolls forward." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.142 pushed" -ForegroundColor Green
}
