$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.640.ps1") { Remove-Item -LiteralPath "push_v3.74.640.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.641"') {
    Write-Host "+ 3.74.641" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ex = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
if ($ex -notmatch "erp_is_sole_senior") { Write-Host "X expense auto-approval (erp_is_sole_senior) missing" -ForegroundColor Red; exit 1 }
if ($ex -notmatch 'soleSenior \? "approved"') { Write-Host "X expense status not wired to soleSenior" -ForegroundColor Red; exit 1 }
Write-Host "+ expense creation auto-approves for the sole owner" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260714000641_v3_74_641_single_owner_self_approval.sql")) {
    Write-Host "X migration record file missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration record present" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

# Verify the live functions snapshot actually captured the new helpers/waivers
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "erp_company_senior_count") { Write-Host "X functions.sql missing erp_company_senior_count (dump incomplete)" -ForegroundColor Red; exit 1 }
if ($fn -notmatch "erp_is_sole_senior") { Write-Host "X functions.sql missing erp_is_sole_senior" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the single-owner helpers" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "app/expenses/new/page.tsx" `
    "supabase/migrations/20260714000641_v3_74_641_single_owner_self_approval.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.641.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.640.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_641.txt"
    $msgLines = @(
        'feat(approvals): v3.74.641 - single-owner self-approval exemption',
        '',
        '- SoD is waived when a company has a single senior (sole owner):',
        '  new helpers erp_company_senior_count() / erp_is_sole_senior().',
        '- Guards/RPCs updated to skip the creator<>approver block when',
        '  senior count <= 1: expense_sod_guard, bank_voucher_sod_guard,',
        '  mmia_sod_guard, approve_supplier_payment, approve_customer_debit_note,',
        '  apply_customer_debit_note.',
        '- Expense creation auto-approves for the sole owner (no pending step).',
        '- Companies with 2+ seniors keep full segregation of duties unchanged.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.641 pushed - sole owner no longer blocked by self-approval" -ForegroundColor Green
}
