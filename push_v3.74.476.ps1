$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.475.ps1") { Remove-Item -LiteralPath "push_v3.74.475.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.476"') {
    Write-Host "+ 3.74.476" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000476_v3_74_476_refunds_and_corrections.sql")) {
    Write-Host "X migration 476 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingCustomerRefund' -or $page -notmatch 'PendingVendorPaymentCorrection') {
    Write-Host "X approvals page missing refund/correction types" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch 'customer_refund_request') {
    Write-Host "X sidebar missing refund badge" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals + sidebar cover refunds + corrections" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_476.txt"
    $msgLines = @(
        'feat(inbox): v3.74.476 - customer refunds + vendor payment corrections join the unified inbox',
        '',
        'Two-phase pattern (approve -> execute). Card is stage-aware:',
        '   pending  -> Approve + Reject buttons',
        '   approved -> Execute button (SoD enforced on DB side)',
        '',
        'Endpoints:',
        '   /api/customer-refund-requests/[id]/{approve,reject,execute}',
        '   /api/vendor-payment-correction-requests/[id]/{approve,reject,execute}',
        '',
        'Sidebar pendingInboxCount adds customer_refund_request +',
        'vendor_refund_request badges.',
        '',
        'History categories + filter buttons added.',
        '',
        'Files',
        '   supabase/migrations/20260701000476_v3_74_476_refunds_and_corrections.sql',
        '   app/approvals/page.tsx',
        '   components/sidebar.tsx',
        '   CONTRACTS.md (Section BW added)',
        '   lib/version.ts -> 3.74.476'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.476 pushed - refunds + corrections live in the unified inbox" -ForegroundColor Green
}
