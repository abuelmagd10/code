$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.474.ps1") { Remove-Item -LiteralPath "push_v3.74.474.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.475"') {
    Write-Host "+ 3.74.475" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000475_v3_74_475_unified_sales_returns.sql")) {
    Write-Host "X migration 475 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingSalesReturnRequest' -or $page -notmatch 'salesReturnRequests') {
    Write-Host "X approvals page missing sales returns" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch 'sales_return_request_l1') {
    Write-Host "X sidebar missing sales_return_request badges" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals + sidebar cover sales returns" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_475.txt"
    $msgLines = @(
        'feat(inbox): v3.74.475 - sales return requests (dual-stage) join the unified inbox',
        '',
        'Card renders a stage badge (management / warehouse) and calls',
        'the matching PATCH endpoint:',
        '   /api/sales-return-requests/[id]/approve',
        '   /api/sales-return-requests/[id]/reject',
        '   /api/sales-return-requests/[id]/warehouse-approve',
        '   /api/sales-return-requests/[id]/warehouse-reject',
        '',
        'Governance intact: each endpoint runs secureApiRequest',
        '(permission invoices:write) + role check +',
        'branch/warehouse gate + notifications.',
        '',
        'Sidebar pendingInboxCount rolls up sales_return_request_l1 +',
        'sales_return_request_warehouse.',
        '',
        'History category + filter button added.',
        '',
        'Files',
        '   supabase/migrations/20260701000475_v3_74_475_unified_sales_returns.sql',
        '   app/approvals/page.tsx',
        '   components/sidebar.tsx',
        '   CONTRACTS.md (Section BV added)',
        '   lib/version.ts -> 3.74.475'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.475 pushed - sales returns live in the unified inbox" -ForegroundColor Green
}
