$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.498.ps1") { Remove-Item -LiteralPath "push_v3.74.498.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.499"') {
    Write-Host "+ 3.74.499" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Guard 1: purchase-posting.ts must debit shipping into inventory
$pp = Get-Content -LiteralPath "lib/purchase-posting.ts" -Raw
if ($pp -notmatch 'شحن مضاف لتكلفة المخزون') {
    Write-Host "X purchase-posting.ts missing shipping debit line" -ForegroundColor Red; exit 1
}
$shipCount = ([regex]::Matches($pp, 'شحن مضاف لتكلفة المخزون')).Count
if ($shipCount -lt 2) {
    Write-Host "X purchase-posting.ts shipping debit not applied to BOTH prepareBillPosting and FromPayload (found $shipCount, expected 2)" -ForegroundColor Red; exit 1
}
Write-Host "+ shipping debit line present in both purchase-posting paths" -ForegroundColor Green

# Guard 2: postBillAtomic signature must accept shipping/adjustment
$ats = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
if ($ats -notmatch 'shipping\?: number') {
    Write-Host "X accounting-transaction-service.ts missing shipping? param on postBillAtomic" -ForegroundColor Red; exit 1
}
Write-Host "+ postBillAtomic signature extended" -ForegroundColor Green

# Guard 3: confirm-receipt route must gate on approval_status + pass shipping/adjustment
$cr = Get-Content -LiteralPath "app/api/bills/[id]/confirm-receipt/route.ts" -Raw
if ($cr -notmatch 'ERR_BILL_PENDING_APPROVAL') {
    Write-Host "X confirm-receipt missing approval_status gate" -ForegroundColor Red; exit 1
}
if ($cr -notmatch 'ERR_BILL_HAS_PENDING_AMENDMENT') {
    Write-Host "X confirm-receipt missing pending amendment gate" -ForegroundColor Red; exit 1
}
if ($cr -notmatch 'shipping: Number\(bill\.shipping') {
    Write-Host "X confirm-receipt not forwarding shipping to postBillAtomic" -ForegroundColor Red; exit 1
}
Write-Host "+ confirm-receipt gate and shipping passthrough wired" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_499.txt"
    $msgLines = @(
        'fix(purchase): v3.74.499 - balance bill receipt JE + gate amendment',
        '',
        'Two bugs surfaced during BILL-0001 confirmation:',
        '',
        'BUG A - JE unbalanced by exactly shipping',
        '  BILL-0001 (subtotal 9.18 + tax 1.43 + shipping 1.00 = total 11.61)',
        '  produced: ACCOUNTING_BALANCE_VIOLATION debit=10.61 credit=11.61 diff=1.00',
        '  post_bill_receipt_atomic rolled back and the receipt could never',
        '  complete. Root cause: prepareBillPosting (and its replay twin',
        '  prepareBillPostingFromPayload) only debited subtotal + VAT while',
        '  crediting the full total_amount to AP - shipping and adjustment',
        '  went into the credit side but had no matching debit.',
        '',
        '  Fix: capitalize shipping and adjustment as extra debits to the',
        '  Inventory account (landed cost). Sales side already routes',
        '  shipping to Cr Sales Revenue, so this only affected purchases.',
        '',
        'BUG B - Amendment gate missing on confirm-receipt',
        '  The route did not check bill.approval_status or scan',
        '  discount_approvals for a pending row. A store_manager could try',
        '  to receive a bill still awaiting owner approval of a pending',
        '  amendment. Now returns 409 with an Arabic reason.',
        '',
        'Files',
        '  lib/purchase-posting.ts (both live and replay paths)',
        '  lib/accounting-transaction-service.ts (postBillAtomic signature)',
        '  app/api/bills/[id]/confirm-receipt/route.ts (gate + passthrough)',
        '  supabase/migrations/20260702000499_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.499'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.499 pushed - receipt JE balanced, amendment gate closed" -ForegroundColor Green
}
