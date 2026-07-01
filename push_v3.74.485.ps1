$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.484.ps1") { Remove-Item -LiteralPath "push_v3.74.484.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.485"') {
    Write-Host "+ 3.74.485" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000485_v3_74_485_receipt_role_matrix.sql")) {
    Write-Host "X migration 485 missing" -ForegroundColor Red; exit 1
}

$api = Get-Content -LiteralPath "app/api/bills/[id]/confirm-receipt/route.ts" -Raw
if ($api -match '"manager"') {
    Write-Host "X manager still in RECEIPT_ROLES on confirm-receipt" -ForegroundColor Red; exit 1
}
Write-Host "+ manager removed from receipt approvers on server" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'canApproveReceipt' -or $page -notmatch 'للاطلاع فقط') {
    Write-Host "X approvals page missing view-only guard" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page hides buttons for view-only roles" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_485.txt"
    $msgLines = @(
        'feat(receipt): v3.74.485 - receipt approval matrix per owner spec',
        '',
        'Approve : owner, admin, general_manager, store_manager (warehouse scope)',
        'View-only: manager, accountant, purchasing_officer (branch scope)',
        '',
        'Server',
        '  app/api/bills/[id]/confirm-receipt/route.ts: manager removed from',
        '  RECEIPT_ROLES. The BillReceiptWorkflowService (reject path) was',
        '  already correct.',
        '',
        'Client',
        '  app/approvals/page.tsx loads company_members.role on mount.',
        '  canApproveReceipt = role in {owner,admin,general_manager,store_manager}.',
        '  For view-only roles the card still renders (so branch staff see',
        '  their branchs pending workload) but the Approve / Reject buttons',
        '  are replaced with a "View only" badge and an italic hint.',
        '',
        'Row visibility preserved by RLS on bills.',
        '',
        'Files',
        '  supabase/migrations/20260701000485_v3_74_485_receipt_role_matrix.sql',
        '  app/api/bills/[id]/confirm-receipt/route.ts',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CF added)',
        '  lib/version.ts -> 3.74.485'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.485 pushed - receipt matrix tightened + inbox view-only UX" -ForegroundColor Green
}
