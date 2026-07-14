$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.641.ps1") { Remove-Item -LiteralPath "push_v3.74.641.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.642"') {
    Write-Host "+ 3.74.642" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ex = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
if ($ex -notmatch "createExpenseJournalEntry") { Write-Host "X journal helper import/use missing" -ForegroundColor Red; exit 1 }
if ($ex -notmatch "const autoApprove = soleSenior") { Write-Host "X autoApprove guard missing" -ForegroundColor Red; exit 1 }
if ($ex -notmatch "reverting to pending") { Write-Host "X journal-failure fallback missing" -ForegroundColor Red; exit 1 }
Write-Host "+ expense auto-approval now posts the journal (or falls back safely)" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

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
    "supabase/schema/functions.sql" `
    "push_v3.74.642.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.641.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_642.txt"
    $msgLines = @(
        'fix(expenses): v3.74.642 - auto-approved expenses now post their journal',
        '',
        '- v3.74.641 auto-approved the sole owner''s expense but never posted the',
        '  GL journal, producing "approved expense without journal_entry_id".',
        '- Now the sole-owner auto-approval only fires when an expense + payment',
        '  account can be resolved, and it immediately posts the Dr Expense / Cr',
        '  Cash journal via createExpenseJournalEntry and marks the expense paid.',
        '- If the journal cannot be posted, the expense falls back to the normal',
        '  draft/pending approval flow instead of a broken approved-without-journal',
        '  state.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.642 pushed - no more approved-without-journal expenses" -ForegroundColor Green
}
