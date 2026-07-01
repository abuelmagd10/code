$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.486.ps1") { Remove-Item -LiteralPath "push_v3.74.486.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.487"') {
    Write-Host "+ 3.74.487" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000487_v3_74_487_history_role_filter.sql")) {
    Write-Host "X migration 487 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'canShowHistory' -or $page -notmatch 'historyCategoryToTab') {
    Write-Host "X approvals page missing history role filter" -ForegroundColor Red; exit 1
}
Write-Host "+ history filter chips + entries are role-scoped" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_487.txt"
    $msgLines = @(
        'feat(inbox): v3.74.487 - history filter chips and results are role-scoped',
        '',
        'v3.74.486 hid the inbox tabs a role could not act on, but the',
        'history filter row still showed every category. Fix: mirror the',
        'same role matrix onto the history chips + on the "all" view.',
        '',
        '- historyCategoryToTab maps each HistoryCategory to a TabKey.',
        '  Manufacturing sub-categories fold into their tab.',
        '- canShowHistory(category) = canShow(mapped tab).',
        '- Each filter chip wrapped in {canShowHistory(...) && ...}.',
        '- The "All" view now filters history entries down to categories',
        '  the role can see, so aggregate counts and lists match the',
        '  visible chips.',
        '',
        'Files',
        '  supabase/migrations/20260701000487_v3_74_487_history_role_filter.sql',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CH added)',
        '  lib/version.ts -> 3.74.487'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.487 pushed - history is role-scoped too" -ForegroundColor Green
}
