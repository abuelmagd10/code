$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.718.ps1") { Remove-Item -LiteralPath "push_v3.74.718.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.719"') {
    Write-Host "+ 3.74.719" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.719]")) { Write-Host "X CHANGELOG missing [3.74.719]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

if ($fn -notmatch "validate_customer_branch_isolation") {
    Write-Host "X the customer branch guard is missing from the DB dump" -ForegroundColor Red; exit 1
}
Write-Host "+ customer branch guard present" -ForegroundColor Green

# The guard must stay permissive where the product guard is, or company-level
# documents and company-wide customers start failing for no reason.
if ($fn -notmatch "IF v_cust_branch IS NULL THEN RETURN NEW") {
    Write-Host "X guard would reject company-wide customers (no branch)" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "IF v_doc_branch IS NULL THEN RETURN NEW") {
    Write-Host "X guard would reject company-level documents (no branch)" -ForegroundColor Red; exit 1
}
Write-Host "+ guard stays permissive for company-level records" -ForegroundColor Green

if ($fn -notmatch "ic_customer_branch_governance") {
    Write-Host "X the orphaned-customer checker is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ orphaned-customer checker present" -ForegroundColor Green

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw

# Creator-only scoping is what let an employee carry another branch's customers
# with him. Both filters must be sent together.
if ($cust -notmatch "staffBranchId") {
    Write-Host "X staff scoping is creator-only again - branch filter not applied" -ForegroundColor Red; exit 1
}
Write-Host "+ staff see their own customers within their branch" -ForegroundColor Green

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
    "app/customers/page.tsx" `
    "supabase/migrations/20260719000719_v3_74_719_customer_branch_isolation.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.719.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.718.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_719.txt"
    $msgLines = @(
        'fix(governance): v3.74.719 - a document may not name a customer from another branch',
        '',
        'Found by the owner: an employee moved between branches and kept seeing - and',
        'could still pick - the customers he had created in the branch he left. His',
        'list showed four, three of them belonging to a branch he no longer works in.',
        '',
        'Root cause: staff see customers filtered by who created them, never by',
        'branch. "Customers I created" follows the person, not the data, so it',
        'travels with the employee. Not theoretical - four documents already name a',
        'customer from a different branch, including a booking created during this',
        'week''s testing.',
        '',
        'The product side has been guarded since v3.74.701 on every items table -',
        'that guard is what blocked adding another branch''s product to a booking.',
        'Customers had no equivalent at all.',
        '',
        'validate_customer_branch_isolation now covers invoices, sales orders,',
        'estimates, bookings, sales returns and customer debit notes. Deliberately',
        'permissive where the product guard is: a document with no branch is',
        'company-level, a customer with no branch is company-wide. Only a real',
        'mismatch is rejected. Verified on live data, rolled back: a sales order in',
        'one branch naming a customer of another is refused; the same customer in',
        'his own branch is accepted.',
        '',
        'Scoping is now the intersection: staff see customers they created AND in',
        'their current branch. Branch alone would be wrong too - it would hand every',
        'rep the whole branch book and undo the per-rep privacy this scoping exists',
        'for. get_customers_overview already accepted both filters; the caller was',
        'only passing one. Useful side effect: permission sharing was granting a',
        'grantee the grantor''s customers with no branch limit, and now inherits it.',
        '',
        'Branch-scoped ownership transfer turned out to exist already - state, query',
        'filter, API payload and the SQL predicate are all in place. It sits under',
        'the Transfer Ownership tab; the owner was on the Share tab, where a branch',
        'picker correctly does not appear. Nothing to build.',
        '',
        'New checker reports orphaned customers (creator no longer in that branch,',
        'so nobody in the customer''s branch sees it) and pre-existing cross-branch',
        'documents. Found three and four respectively. Existing violations are',
        'reported, not auto-corrected: they carry posted journals and the right',
        'answer differs case by case.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.719 pushed - customer branch isolation enforced" -ForegroundColor Green
}
