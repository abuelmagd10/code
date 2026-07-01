$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.477.ps1") { Remove-Item -LiteralPath "push_v3.74.477.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.478"') {
    Write-Host "+ 3.74.478" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000478_v3_74_478_goods_receipt.sql")) {
    Write-Host "X migration 478 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingGoodsReceipt' -or $page -notmatch 'confirm-receipt') {
    Write-Host "X approvals page missing goods receipt" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch 'bill_receipt') {
    Write-Host "X sidebar missing bill_receipt" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals + sidebar cover goods receipt" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_478.txt"
    $msgLines = @(
        'feat(inbox): v3.74.478 - goods receipt approvals join the unified inbox',
        '',
        'Purchase bills with receipt_status=pending appear as a new tab.',
        'Actions call /api/bills/[id]/confirm-receipt and reject-receipt.',
        'Governance intact: warehouse role + warehouse gate identical to',
        'the bill_receipt predicate in get_user_approval_badges.',
        '',
        'Sidebar rolls up bill_receipt.',
        '',
        'Files',
        '   supabase/migrations/20260701000478_v3_74_478_goods_receipt.sql',
        '   app/approvals/page.tsx',
        '   components/sidebar.tsx',
        '   CONTRACTS.md (Section BY added)',
        '   lib/version.ts -> 3.74.478'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.478 pushed - goods receipt approvals live in the unified inbox" -ForegroundColor Green
}
