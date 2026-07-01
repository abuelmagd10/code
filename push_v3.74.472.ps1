$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.471.ps1") { Remove-Item -LiteralPath "push_v3.74.471.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.472"') {
    Write-Host "+ 3.74.472" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000472_v3_74_472_unified_supplier_payments.sql")) {
    Write-Host "X migration 472 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 472 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BS\. ?صندوق موحّد للموافقات') {
    Write-Host "X CONTRACTS.md missing Section BS" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BS" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingSupplierPayment' -or $page -notmatch 'supplierPayments') {
    Write-Host "X approvals page missing supplier payments" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page includes supplier payments tab" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_472.txt"
    $msgLines = @(
        'feat(inbox): v3.74.472 - supplier payment approvals join the unified inbox',
        '',
        'Owner asked to consolidate approval pages into صندوق الموافقات',
        'while preserving all governance. Starting with supplier payments',
        'since the next test step is bill -> payment -> owner approves.',
        '',
        'UI-only, additive. Existing /payments page still works.',
        '',
        'Approvals page',
        '   New "دفعات موردين" tab with pending count',
        '   Card shows: payment_no, supplier, amount + currency,',
        '   linked bill, branch, warehouse, requested_at',
        '   Approve + Reject (with reason) call',
        '   /api/supplier-payments/[id]/approve',
        '',
        'Governance preserved end to end:',
        '   SupplierPaymentCommandService.processDecision',
        '     -> approve_supplier_payment_atomic (role check + SoD',
        '        + JE creation)',
        '   PaymentApprovalNotificationService fires approved/rejected',
        '   notifications to the requester.',
        '',
        'Next phases (v3.74.473+): purchase returns, sales returns,',
        'dispatch approvals, refund requests, write-offs, etc.',
        '',
        'Files',
        '   supabase/migrations/20260701000472_v3_74_472_unified_supplier_payments.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BS added)',
        '   lib/version.ts -> 3.74.472'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.472 pushed - supplier payments live in the unified inbox" -ForegroundColor Green
}
