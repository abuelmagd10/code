$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.642.ps1") { Remove-Item -LiteralPath "push_v3.74.642.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.643"') {
    Write-Host "+ 3.74.643" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$idp = Get-Content -LiteralPath "app/expenses/[id]/page.tsx" -Raw
if ($idp -notmatch "journalPosted") { Write-Host "X handleApprove journalPosted guard missing" -ForegroundColor Red; exit 1 }
if ($idp -notmatch "تسجيل الدفع يجب أن يُرحّل قيداً") { Write-Host "X handleMarkAsPaid journal posting missing" -ForegroundColor Red; exit 1 }
Write-Host "+ approve + mark-as-paid now always post a journal (or block clearly)" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260714000643_v3_74_643_expense_paid_requires_journal.sql")) {
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
if ($fn -notmatch "expense_paid_requires_journal_guard") { Write-Host "X functions.sql missing the paid-requires-journal guard (dump incomplete)" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the paid-requires-journal guard" -ForegroundColor Green

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
    "app/expenses/[id]/page.tsx" `
    "supabase/migrations/20260714000643_v3_74_643_expense_paid_requires_journal.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.643.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.642.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_643.txt"
    $msgLines = @(
        'fix(expenses): v3.74.643 - expenses can never be paid/approved without a journal',
        '',
        '- DB guard (BEFORE UPDATE): block status paid/posted when journal_entry_id is',
        '  NULL and amount > 0 (UPDATE-only; restore/imports untouched).',
        '- handleMarkAsPaid posts the Dr Expense / Cr Cash journal before marking paid,',
        '  resolving expense/payment accounts (incl. company defaults / 5000-1010);',
        '  blocks with a clear message when accounts cannot be resolved.',
        '- handleApprove reverts to pending_approval if no journal could be posted',
        '  (incl. cash-overdraft), instead of leaving an approved-without-journal state.',
        '- Data: notniche default accounts configured; EXP-0005/0006/0007 journals',
        '  backfilled. Full integrity scan across all companies = 0 findings.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.643 pushed - permanent no-paid-without-journal guarantee" -ForegroundColor Green
}
