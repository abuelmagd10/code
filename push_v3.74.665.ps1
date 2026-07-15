$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.664.ps1") { Remove-Item -LiteralPath "push_v3.74.664.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.665"') {
    Write-Host "+ 3.74.665" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.665]")) { Write-Host "X CHANGELOG missing [3.74.665]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260715000665_v3_74_665_owner_always_exempt_approvals.sql")) { Write-Host "X 665 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "erp_is_company_owner") { Write-Host "X functions.sql missing erp_is_company_owner (dump incomplete)" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the owner-exempt helper" -ForegroundColor Green

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

# Selective staging — this release is DB-only. The TS working tree carries
# global CRLF/filemode noise from the Windows mount; we deliberately do NOT
# stage app source here (the v3.74.664 code is already in HEAD).
git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260715000665_v3_74_665_owner_always_exempt_approvals.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.665.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.664.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_665.txt"
    $msgLines = @(
        'feat(approvals): v3.74.665 - owner is ALWAYS exempt from self-approval / SoD',
        '',
        '- New helper erp_is_company_owner(company_id, user_id).',
        '- Owner (companies.user_id) is exempt from self-approval on his own',
        '  creations ALWAYS (not only when sole senior). general_manager / admin',
        '  still follow the normal 2+-seniors SoD rule.',
        '- Patched: approve_supplier_payment, approve_customer_debit_note,',
        '  apply_customer_debit_note, bank_voucher_sod_guard (x2),',
        '  expense_sod_guard (x2), mmia_sod_guard.',
        '- Replaces the v3.74.641 "sole senior only" exemption.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.665 pushed - owner always exempt from approvals" -ForegroundColor Green
}
