$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.479.ps1") { Remove-Item -LiteralPath "push_v3.74.479.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.480"') {
    Write-Host "+ 3.74.480" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000480_v3_74_480_misc_pending.sql")) {
    Write-Host "X migration 480 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingMiscApproval' -or $page -notmatch 'purchase_requests' -or $page -notmatch 'permission_transfers') {
    Write-Host "X approvals page missing misc types" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
foreach ($k in @('purchase_request','expense','bank_voucher_request','customer_debit_note','permission_transfer')) {
    if ($sb -notmatch $k) {
        Write-Host "X sidebar missing $k" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ approvals + sidebar cover all misc types" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_480.txt"
    $msgLines = @(
        'feat(inbox): v3.74.480 - final batch. Purchase requests + bank vouchers + expenses + customer debit notes + permission transfers',
        '',
        'Single "Other Requests" tab collects the remaining five categories',
        'as link-out cards. Actions stay on their dedicated pages where the',
        'full governance context lives.',
        '',
        'Sidebar pendingInboxCount now rolls up every badge key from',
        'get_user_approval_badges.',
        '',
        'The unification effort (v3.74.472 through v3.74.480) is complete:',
        'the /approvals inbox surfaces every pending workflow across the',
        'system in one place with governance preserved end to end.',
        '',
        'Files',
        '   supabase/migrations/20260701000480_v3_74_480_misc_pending.sql',
        '   app/approvals/page.tsx',
        '   components/sidebar.tsx',
        '   CONTRACTS.md (Section CA added)',
        '   lib/version.ts -> 3.74.480'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.480 pushed - unified inbox is complete" -ForegroundColor Green
}
