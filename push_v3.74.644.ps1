$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.643.ps1") { Remove-Item -LiteralPath "push_v3.74.643.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.644"') {
    Write-Host "+ 3.74.644" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$nw = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
if ($nw -notmatch "BLOCKED_EXPENSE_SUBTYPES") { Write-Host "X expense-account dropdown filter missing" -ForegroundColor Red; exit 1 }
Write-Host "+ expense-account dropdown hides COGS/purchases accounts" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260714000644_v3_74_644_expense_account_type_guard.sql")) {
    Write-Host "X migration record missing" -ForegroundColor Red; exit 1
}

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "expense_account_type_guard") { Write-Host "X functions.sql missing expense_account_type_guard (dump incomplete)" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the expense-account guard" -ForegroundColor Green

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
    "supabase/migrations/20260714000644_v3_74_644_expense_account_type_guard.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.644.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.643.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_644.txt"
    $msgLines = @(
        'feat(expenses): v3.74.644 - prevent booking expenses to COGS/purchases accounts',
        '',
        '- UI: expense-account dropdown hides COGS/purchases accounts (sub_type',
        '  cogs/cost_of_goods_sold/purchases/... or codes 5100/5110/5120/5130).',
        '- DB backstop: expense_account_type_guard trigger blocks linking an expense',
        '  to a COGS/purchases account; fires only when the account is set/changed,',
        '  so legacy rows are untouched.',
        '- Data: notniche EXP-0003 (2,300) reclassified COGS -> Other Expenses;',
        '  gross profit corrected 8,400 -> 10,700 (net profit unchanged).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.644 pushed - expenses can no longer hit COGS/purchases accounts" -ForegroundColor Green
}
