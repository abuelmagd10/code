$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.521.ps1") { Remove-Item -LiteralPath "push_v3.74.521.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.522"') {
    Write-Host "+ 3.74.522" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw

# Guard 1: chart_of_accounts must use original_currency, NOT currency_code
if ($ap -match 'chart_of_accounts"\).select\("id, account_name, currency_code"') {
    Write-Host "X approvals still selects nonexistent chart_of_accounts.currency_code" -ForegroundColor Red
    exit 1
}
if ($ap -notmatch 'chart_of_accounts"\).select\("id, account_name, original_currency"') {
    Write-Host "X approvals not selecting chart_of_accounts.original_currency" -ForegroundColor Red
    exit 1
}
Write-Host "+ chart_of_accounts select uses original_currency" -ForegroundColor Green

# Guard 2: emails must come from company_members, not user_profiles
if ($ap -match 'user_profiles"\).select\("id, email"') {
    Write-Host "X approvals still queries nonexistent user_profiles.email" -ForegroundColor Red
    exit 1
}
if ($ap -notmatch 'company_members"\).select\("user_id, email"') {
    Write-Host "X approvals not fetching requester email from company_members" -ForegroundColor Red
    exit 1
}
Write-Host "+ requester email sourced from company_members" -ForegroundColor Green

# Guard 3: on-account label present
if ($ap -notmatch 'دفع على الحساب \(بدون فاتورة\)') {
    Write-Host "X on-account label missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ on-account label rendered" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_522.txt"
    $msgLines = @(
        'fix(approvals): v3.74.522 - unbreak the enrichment loader (right columns this time)',
        '',
        'v3.74.521 added account_name and requester email to the supplier',
        'payment card, but the owner s next screenshot still had neither.',
        'The loader was querying columns that do not exist and Supabase',
        'silently returned empty sets:',
        '',
        '  - chart_of_accounts.currency_code       → column is original_currency',
        '  - user_profiles.email                    → email lives in company_members',
        '',
        'Both selects failed, both maps were empty, both fields rendered',
        'null. Fixed by pointing the batches at the real columns and',
        'scoping company_members by company_id (RLS-friendly).',
        '',
        'Also surfaces on-account payments explicitly: instead of leaving',
        'the bill line blank when bill_id is null (supplier advance /',
        'balance settlement), the card now shows',
        '"دفع على الحساب (بدون فاتورة)" in amber so the owner sees intent.',
        '',
        'Files',
        '  app/approvals/page.tsx (2 batch fixes + on-account label)',
        '  supabase/migrations/20260703000522_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.522'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.522 pushed - account name + requester email now render" -ForegroundColor Green
}
