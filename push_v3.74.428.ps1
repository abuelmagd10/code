$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.427.ps1") { Remove-Item -LiteralPath "push_v3.74.427.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.428"') {
    Write-Host "+ 3.74.428" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000428_v3_74_428_branch_manager_notifications.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 428 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AB\. ?إشعارات نشاط الفرع') {
    Write-Host "X CONTRACTS.md missing Section AB" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AB" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_428.txt"
    $msgLines = @(
        'feat(notifications): v3.74.428 - branch manager activity notifications',
        '',
        'The branch manager (role=manager with a branch_id) was invisible',
        'in the purchase cycle. Discount triggers excluded the role',
        'explicitly, PO approval notifications went to owner/GM only, and',
        'no FYI channel existed. Branch managers had to discover events',
        'by polling list pages.',
        '',
        'Central helper + four triggers fix that:',
        '   notify_branch_manager(company_id, branch_id, ref_type,',
        '                         ref_id, actor_id, title, message)',
        '     -- targets role=manager on the branch, skips the actor,',
        '     -- writes one row per manager into notifications with',
        '     -- category=branch_activity for inbox filtering.',
        '   po_branch_manager_notify              on purchase_orders',
        '   bill_branch_manager_notify            on bills',
        '   payment_branch_manager_notify         on payments (supplier)',
        '   purchase_return_branch_manager_notify on purchase_returns',
        '',
        'All FYI notifications keep reference_type as the document type,',
        'so the routing map sends the manager to the document page on',
        'click. category=branch_activity lets the inbox UI separate them',
        'from approval requests visually.',
        '',
        'Baseline (Section AB) verifies the helper + four triggers and',
        'is invoked via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000428_v3_74_428_branch_manager_notifications.sql',
        '   CONTRACTS.md (Section AB added)',
        '   lib/version.ts -> 3.74.428'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.428 pushed - branch managers can finally see their branch" -ForegroundColor Green
}
