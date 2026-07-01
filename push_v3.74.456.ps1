$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.455.ps1") { Remove-Item -LiteralPath "push_v3.74.455.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.456"') {
    Write-Host "+ 3.74.456" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BC\. ?Bill/Invoice discount API') {
    Write-Host "X CONTRACTS.md missing Section BC" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BC" -ForegroundColor Green

$billApi = Get-Content -LiteralPath "app/api/bills/[id]/discount-approval/route.ts" -Raw
if ($billApi -notmatch 'purchase_order_id' -or $billApi -notmatch 'poApproval') {
    Write-Host "X bill API missing PO fallback" -ForegroundColor Red; exit 1
}
Write-Host "+ bill API reads linked PO approval" -ForegroundColor Green

$invApi = Get-Content -LiteralPath "app/api/invoices/[id]/discount-approval/route.ts" -Raw
if ($invApi -notmatch 'sales_order_id' -or $invApi -notmatch 'soApproval') {
    Write-Host "X invoice API missing SO fallback" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice API reads linked SO approval" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_456.txt"
    $msgLines = @(
        'fix(discounts): v3.74.456 - bill/invoice API reads linked PO/SO approval',
        '',
        'Accountant opened BILL-0001 (auto-created from an approved PO)',
        'and saw an orange warning "الخصم يحتاج اعتماد ولم يتم إرساله".',
        'Cause: /api/bills/[id]/discount-approval only queried',
        'discount_approvals with document_type=purchase_invoice. The',
        'auto-create path sets the skip_discount_approval flag, so no',
        'bill-level row exists — the parent PO covers it.',
        '',
        'Fix: the API now also reads the linked PO discount_approval',
        'when the bill has purchase_order_id. Precedence: PO approval',
        'wins the gate (approved -> open, rejected -> blocked_rejected,',
        'pending -> blocked_pending). Falls back to the old bill-level',
        'logic when the bill was created without a PO.',
        '',
        'We deliberately do not compare discount_type/value across',
        'PO and bill. The evaluator normalizes to amount, PO/bill rows',
        'keep percent. bill_request_discount_approval_trg (v3.74.424)',
        'already enforces the write-time match; the banner just',
        'reflects state.',
        '',
        'Mirror fix on /api/invoices/[id]/discount-approval for',
        'invoices auto-created from sales orders.',
        '',
        'Files',
        '   app/api/bills/[id]/discount-approval/route.ts',
        '   app/api/invoices/[id]/discount-approval/route.ts',
        '   CONTRACTS.md (Section BC added)',
        '   lib/version.ts -> 3.74.456'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.456 pushed - bill/invoice banner reflects PO/SO approval" -ForegroundColor Green
}
