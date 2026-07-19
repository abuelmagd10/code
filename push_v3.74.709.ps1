$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.708.ps1") { Remove-Item -LiteralPath "push_v3.74.708.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.709"') {
    Write-Host "+ 3.74.709" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.709]")) { Write-Host "X CHANGELOG missing [3.74.709]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "Posting account has no parent") {
    Write-Host "X the orphan-account rule is missing from the checker" -ForegroundColor Red; exit 1
}
Write-Host "+ checker detects parentless posting accounts" -ForegroundColor Green

$coa = Get-Content -LiteralPath "app/chart-of-accounts/ClientPage.tsx" -Raw

# quickAdd was the cause: it must no longer hardcode codes or look up A1B/A1C alone.
if ($coa -match 'account_code: type === "bank" \? "1010" : "1000"') {
    Write-Host "X quickAdd still hardcodes the account code" -ForegroundColor Red; exit 1
}
if ($coa -match 'const parentCode = type === "bank" \? "A1B" : "A1C"') {
    Write-Host "X quickAdd still resolves its parent by A1B/A1C only" -ForegroundColor Red; exit 1
}
Write-Host "+ quickAdd derives parent and code from the real chart" -ForegroundColor Green

# Both schemes must still be resolvable - the alphanumeric one is dormant, not dead.
if ($coa -notmatch "findCashBankGroup") {
    Write-Host "X the scheme-aware group resolver is missing" -ForegroundColor Red; exit 1
}
if ($coa -notmatch '"1120", "A1B"' -or $coa -notmatch '"1110", "A1C"') {
    Write-Host "X the resolver no longer covers both numbering schemes" -ForegroundColor Red; exit 1
}
Write-Host "+ both numbering schemes resolved" -ForegroundColor Green

# The normalizer must adopt orphans ONLY. Without this it relocates 1185
# (employee advances, typed cash) in every company on page load.
if ($coa -notmatch "if \(acc\.parent_id\) continue") {
    Write-Host "X the normalizer would re-file accounts that already have a parent" -ForegroundColor Red; exit 1
}
Write-Host "+ normalizer adopts orphans only" -ForegroundColor Green

# Cash and bank are mutually exclusive.
if ($coa -notmatch "is_cash: e\.target\.checked \? false : formData\.is_cash") {
    Write-Host "X the cash/bank checkboxes are not mutually exclusive" -ForegroundColor Red; exit 1
}
Write-Host "+ cash/bank checkboxes mutually exclusive" -ForegroundColor Green

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
    "supabase/migrations/20260719000709_v3_74_709_orphan_accounts_and_quickadd_cause.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.709.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.708.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_709.txt"
    $msgLines = @(
        'fix(coa): v3.74.709 - fix the real cause (quickAdd), adopt orphans only',
        '',
        'The owner asked me to verify whether the A1B/A1C codes belong to another',
        'numbering scheme before repairing normalizeCashBankParents. Verifying it',
        'changed the answer three times.',
        '',
        '(a) The alphanumeric scheme is real but dormant. A Zoho-style tree exists',
        'via seedZohoDefault and scripts/011_seed_custom_coa_ar.sql, but the seeder',
        'has no call site, the script is not a migration, and no company holds one',
        'A1B/A1C row. Dormant, not dead - so both schemes are now resolved rather',
        'than deleting the alphanumeric branch.',
        '',
        '(b) I had been fixing the wrong function. normalizeCashBankParents is the',
        'cleanup that never ran; quickAdd is the cause. It resolved the parent by',
        'A1B/A1C - absent from every numeric chart - so parentId fell back to no',
        'parent at all, and HARDCODED the code to 1010 for bank, 1000 for cash,',
        'whatever the chart contained. The bad accounts match those defaults',
        'verbatim, including a third one in another company carrying 25 journal',
        'lines. Fixed at source.',
        '',
        '(c) The routine''s premise was false, and checking the data before enabling',
        'it proved so. "Every cash-typed account belongs under the cash group" is',
        'wrong: 1185 employee advances is typed cash and sits under 1100 in all',
        'four companies. Switching it on as written would have relocated a template',
        'account in every company on page load. It now adopts orphans only.',
        '',
        'Checker blind spot found the same way: orphans carry level = 1 and look',
        'like roots, so filtering on level > 1 hid four of the five. A real root',
        'always has children, so "no parent and no children" is the reliable test.',
        '',
        'Repair covers cash/bank orphans only. The three partner capital accounts',
        'and the manufacturing overhead account carry real balances and their',
        'correct parent is a judgement about the owner''s chart, not a guess - the',
        'checker reports them for him to place.',
        '',
        'Third contributing bug: the bank and cash checkboxes were not mutually',
        'exclusive, so with both ticked the last click silently won the sub_type.',
        'That is how a bank account became cash-typed and vanished from every',
        'bank-only picker.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.709 pushed - cause fixed at source, orphans adopted" -ForegroundColor Green
}
