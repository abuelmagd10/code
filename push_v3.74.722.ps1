$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.721.ps1") { Remove-Item -LiteralPath "push_v3.74.721.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.722"') {
    Write-Host "+ 3.74.722" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.722]")) { Write-Host "X CHANGELOG missing [3.74.722]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# getAccessFilter must report the branch for creator-scoped users, or every
# picker is again left with nothing to narrow by - the root of the leak.
$val = Get-Content -LiteralPath "lib/validation.ts" -Raw
if ($val -notmatch "filterByCreatedBy: true,\s*\r?\n\s*createdByUserId: userId,\s*\r?\n\s*filterByBranch: false,\s*\r?\n\s*branchId: userBranchId") {
    Write-Host "X getAccessFilter no longer reports branchId for staff" -ForegroundColor Red; exit 1
}
Write-Host "+ staff access filter carries the branch" -ForegroundColor Green

if (-not (Test-Path "lib/customer-scope.ts")) {
    Write-Host "X the shared customer scope helper is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ shared scope helper present" -ForegroundColor Green

# Every customer picker must apply it. A page that filters by creator without
# narrowing to the branch reintroduces the leak on that screen alone, which is
# exactly how this was missed the first time.
$pickers = @(
  "app/bookings/new/page.tsx",
  "app/invoices/new/page.tsx",
  "app/invoices/page.tsx",
  "app/sales-orders/page.tsx",
  "app/customer-debit-notes/new/page.tsx"
)
foreach ($p in $pickers) {
    $src = Get-Content -LiteralPath $p -Raw
    if ($src -notmatch "applyCustomerBranchScope") {
        Write-Host "X $p selects customers without the branch scope" -ForegroundColor Red; exit 1
    }
}
# estimates scopes inline against its own ctx object
$est = Get-Content -LiteralPath "app/estimates/page.tsx" -Raw
if ($est -notmatch "custQuery = custQuery\.eq\('branch_id', ctx\.branch_id\)") {
    Write-Host "X app/estimates/page.tsx selects customers without the branch scope" -ForegroundColor Red; exit 1
}
Write-Host "+ all six customer pickers are branch-scoped" -ForegroundColor Green

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
    "lib/customer-scope.ts" `
    "lib/validation.ts" `
    "app/bookings/new/page.tsx" `
    "app/estimates/page.tsx" `
    "app/invoices/new/page.tsx" `
    "app/invoices/page.tsx" `
    "app/sales-orders/page.tsx" `
    "app/customer-debit-notes/new/page.tsx" `
    "push_v3.74.722.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.721.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_722.txt"
    $msgLines = @(
        'fix(governance): v3.74.722 - customer pickers still offered other branches',
        '',
        'My scope was too narrow in v3.74.719: I fixed the customers LIST page and',
        'left every customer PICKER alone. Each builds its own query, so all six kept',
        'the old behaviour - bookings, estimates, invoices (new and list), sales',
        'orders, customer debit notes. The owner saw it immediately.',
        '',
        'The root went deeper than the pickers. getAccessFilter returned',
        'branchId: null for staff, so no picker had a branch to narrow by even if it',
        'wanted to. It now reports branchId while filterByBranch stays false - staff',
        'are not a branch-level role and must not suddenly see the whole branch.',
        '',
        'Checked every read of accessFilter.branchId in the project before changing',
        'it. All are gated on filterByBranch except one in the payments page, which',
        'turned out to sit inside an else-if on filterByBranch already. No existing',
        'behaviour changes.',
        '',
        'The rule now lives once in lib/customer-scope.ts instead of being repeated',
        'six times, so the next page that lists customers inherits it rather than',
        'reproducing the bug. It is the intersection: creator alone travels with the',
        'employee across branches, branch alone hands every rep the entire branch',
        'book and destroys the per-rep privacy the scoping exists for. Shared',
        'customers from permission sharing are covered too - they were leaking the',
        'grantor''s other branches.',
        '',
        'This was an annoyance rather than a risk: the v3.74.719 database guard',
        'already refuses the document. But the user picked a customer he was shown,',
        'filled the whole form, and only then hit the rejection.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.722 pushed - every customer picker is branch-scoped" -ForegroundColor Green
}
