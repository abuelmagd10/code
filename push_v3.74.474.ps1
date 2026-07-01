$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.473.ps1") { Remove-Item -LiteralPath "push_v3.74.473.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.474"') {
    Write-Host "+ 3.74.474" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000474_v3_74_474_sidebar_and_history.sql")) {
    Write-Host "X migration 474 missing" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch 'payment_approval' -or $sb -notmatch 'purchase_return_admin') {
    Write-Host "X sidebar missing new badge keys" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar includes payment_approval + purchase_return_admin" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'supplier_payment.*Supplier Payment' -or $page -notmatch 'purchase_return.*Purchase Return') {
    Write-Host "X history categories not fully wired" -ForegroundColor Red; exit 1
}
Write-Host "+ history categories include new types" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_474.txt"
    $msgLines = @(
        'feat(inbox): v3.74.474 - sidebar count + history include the new inbox categories',
        '',
        'UI-only. No DB changes.',
        '',
        'Sidebar',
        '   pendingInboxCount rolls up payment_approval and',
        '   purchase_return_admin from the existing',
        '   get_user_approval_badges RPC.',
        '',
        'History',
        '   HistoryCategory: supplier_payment + purchase_return added.',
        '   loadHistory pulls decided rows from payments (payment_type=',
        '   supplier_payment) and purchase_returns (workflow_status IN',
        '   approved/rejected/posted/completed).',
        '   New filter buttons on the history tab.',
        '',
        'Files',
        '   components/sidebar.tsx',
        '   app/approvals/page.tsx',
        '   supabase/migrations/20260701000474_v3_74_474_sidebar_and_history.sql',
        '   CONTRACTS.md (Section BU added)',
        '   lib/version.ts -> 3.74.474'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.474 pushed - sidebar + history cover the new inbox categories" -ForegroundColor Green
}
