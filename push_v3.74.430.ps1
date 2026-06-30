$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.429.ps1") { Remove-Item -LiteralPath "push_v3.74.429.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.430"') {
    Write-Host "+ 3.74.430" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000430_v3_74_430_sales_side_workflow.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 430 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AD\. ?نظائر دورة المبيعات') {
    Write-Host "X CONTRACTS.md missing Section AD" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AD" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch '"sales_return"') {
    Write-Host "X approvals page missing sales_return branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page handles sales_return" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_430.txt"
    $msgLines = @(
        'feat(approvals,notifications): v3.74.430 - sales side equivalents',
        '',
        'Closes the symmetry gap: the purchase cycle had approval gates,',
        'branch-manager FYIs and accountant pings (v3.74.426..429). This',
        'mirrors the same machinery on the sales side.',
        '',
        'Part A: ALTER sales_returns to add the 5 approval columns',
        '   approved_by, approved_at, rejected_by, rejected_at,',
        '   rejection_reason.',
        '',
        'Part B: sales_returns approval gates (mirror v3.74.427):',
        '   sales_return_approval_insert  (BEFORE INSERT)',
        '   sales_return_approval_update  (BEFORE UPDATE)',
        '   sales_return_notify_approval  (AFTER INS/UPD)',
        '   approve_sales_return_atomic   (RPC)',
        '',
        'Part C: branch manager FYIs + accountant ping for sales:',
        '   so_branch_manager_notify                 on sales_orders',
        '   invoice_branch_manager_notify            on invoices',
        '   payment_customer_branch_manager_notify   on payments',
        '   sales_return_branch_manager_notify       on sales_returns',
        '   invoice_notify_accountant                on invoices',
        '',
        'UI: /approvals page learns the new "sales_return" doc type',
        'and routes it to /sales-returns/<id>.',
        '',
        'Baseline (Section AD) verifies the 5 columns, 9 functions, 8',
        'triggers, and the role/category invariants. Wired via',
        'PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000430_v3_74_430_sales_side_workflow.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section AD added)',
        '   lib/version.ts -> 3.74.430'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.430 pushed - sales side now mirrors purchases" -ForegroundColor Green
}
