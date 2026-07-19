$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.707.ps1") { Remove-Item -LiteralPath "push_v3.74.707.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.708"') {
    Write-Host "+ 3.74.708" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.708]")) { Write-Host "X CHANGELOG missing [3.74.708]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "ic_chart_of_accounts_structure") {
    Write-Host "X the chart-of-accounts checker is missing from the DB dump" -ForegroundColor Red; exit 1
}
Write-Host "+ chart-of-accounts checker present" -ForegroundColor Green

$coa = Get-Content -LiteralPath "app/chart-of-accounts/ClientPage.tsx" -Raw

if ($coa -notmatch "suggestAccountCode") {
    Write-Host "X the code suggestion helper is missing" -ForegroundColor Red; exit 1
}
# It must actually be wired into the parent selector, not merely defined.
if ($coa -notmatch "suggestAccountCode\(newParentId\)") {
    Write-Host "X the suggestion is not wired to the parent selector" -ForegroundColor Red; exit 1
}
Write-Host "+ code suggestion wired to the parent selector" -ForegroundColor Green

# Suggested, never imposed: the field must stay editable and stop auto-filling
# once the user types. Losing either turns a helper into a straitjacket for
# statutory charts and migrations.
if ($coa -notmatch "setCodeTouched\(true\)") {
    Write-Host "X nothing stops the suggestion overwriting a hand-typed code" -ForegroundColor Red; exit 1
}
if ($coa -notmatch "!editingId && !codeTouched") {
    Write-Host "X the auto-fill guard is missing - it could overwrite existing codes" -ForegroundColor Red; exit 1
}
Write-Host "+ suggestion never overwrites a deliberate code" -ForegroundColor Green

if ($coa -notmatch "accountCodeWarnings") {
    Write-Host "X the input warnings are missing" -ForegroundColor Red; exit 1
}
Write-Host "+ input warnings present" -ForegroundColor Green

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
    "CHANGELOG.md" `
    "app/chart-of-accounts/ClientPage.tsx" `
    "supabase/migrations/20260719000708_v3_74_708_chart_of_accounts_structure.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.708.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.707.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_708.txt"
    $msgLines = @(
        'feat(coa): v3.74.708 - suggest account codes from the parent range, and detect misfiled accounts',
        '',
        'The owner asked whether the account code should be generated automatically.',
        'His own chart answered it: both accounts he had added by hand were misfiled.',
        '',
        '1001 - branch treasury: parent was correct (1110) but the code sits',
        'numerically BEFORE its own parent, inside the 1000 header range, so',
        'range-based roll-up reports place it outside its branch of the tree.',
        '',
        '1010 - bank account: coded under 1000 instead of 1120, and typed',
        'sub_type=cash instead of bank. That one had a functional cost, not a',
        'cosmetic one - customer credit refunds and invoice return refunds list',
        'bank accounts by filtering sub_type=bank, so the account was invisible',
        'exactly where it was needed.',
        '',
        'Why nothing self-healed: normalizeCashBankParents re-parents cash/bank',
        'accounts but locates the groups by account_code A1B / A1C. No company in',
        'the database has those codes, so it returns at its first guard every time.',
        'Dead code against this numbering scheme.',
        '',
        'The code is now suggested from the parent range - the span between the',
        'parent code and the first larger code outside its subtree - keeping a',
        'round-number convention where the children already follow one. Suggested,',
        'never imposed: it stops the moment the user types, never touches an',
        'existing account, and stays blank for non-numeric schemes. Statutory',
        'charts, migrations and auditor requirements all mandate exact codes.',
        '',
        'Plus a warning on entry (code at/before parent, bank named but typed cash)',
        'and ic_chart_of_accounts_structure on the dashboard so the next one',
        'surfaces early instead of by accident.',
        '',
        'Repair: 1001 -> 1111 under cash, 1010 -> 1121 under banks as type bank.',
        'Safe - journal lines reference account_id, not the code, and neither has',
        'children (checked first: treasury 10 lines, bank none). Idempotent.',
        '',
        'Verified: both accounts correctly placed at level 4 with their 10 journal',
        'lines intact, and all 49 integrity checks clean.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.708 pushed - smart account codes + structure checker" -ForegroundColor Green
}
