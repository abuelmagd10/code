$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.724.ps1") { Remove-Item -LiteralPath "push_v3.74.724.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.725"') {
    Write-Host "+ 3.74.725" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.725]")) { Write-Host "X CHANGELOG missing [3.74.725]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The UI filter must accept a branchless customer, because the database guard
# does. An exact branch match hides the one mechanism the system has for a
# customer who deals with more than one branch.
$scope = Get-Content -LiteralPath "lib/customer-scope.ts" -Raw
if ($scope -match '\.eq\("branch_id", branchId\)') {
    Write-Host "X exact branch match is back - shared customers vanish from every picker" -ForegroundColor Red; exit 1
}
if ($scope -notmatch "branch_id\.is\.null") {
    Write-Host "X the scope helper no longer admits shared (branchless) customers" -ForegroundColor Red; exit 1
}
Write-Host "+ shared customers stay visible" -ForegroundColor Green

$est = Get-Content -LiteralPath "app/estimates/page.tsx" -Raw
if ($est -notmatch "branch_id\.is\.null") {
    Write-Host "X estimates still filters shared customers out" -ForegroundColor Red; exit 1
}
Write-Host "+ estimates admits shared customers" -ForegroundColor Green

# The third state must be nameable in the form, and must reach the server as a
# real null rather than the sentinel string.
$form = Get-Content -LiteralPath "components/customers/customer-form-dialog.tsx" -Raw
if ($form -notmatch "__shared__") {
    Write-Host "X the Shared branch option is missing from the customer form" -ForegroundColor Red; exit 1
}
if ($form -notmatch "formData\.branch_id === '__shared__' \? null") {
    Write-Host "X the sentinel is not converted to null - it would be saved as a literal" -ForegroundColor Red; exit 1
}
Write-Host "+ shared option is selectable and saves as null" -ForegroundColor Green

# Parking with the owner must only happen when the old branch really has nobody.
$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -notmatch "remainingStaff") {
    Write-Host "X customers are not parked with the owner when a branch is emptied" -ForegroundColor Red; exit 1
}
if ($usr -notmatch '\.neq\("user_id", editingMemberId\)') {
    Write-Host "X the staff check counts the departing employee - it would never park" -ForegroundColor Red; exit 1
}
Write-Host "+ owner parking only when the branch is truly unstaffed" -ForegroundColor Green

# Parking deposits customers with the owner, who is normally the person on this
# screen. If the source dropdown still hides the current user, those customers
# land somewhere no dropdown can reach.
if ($usr -notmatch "permissionAction === 'transfer' \|\| !m\.is_current") {
    Write-Host "X the owner cannot be picked as transfer source - parked customers are unreachable" -ForegroundColor Red; exit 1
}
Write-Host "+ owner is selectable as the source of a transfer" -ForegroundColor Green

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
    "app/estimates/page.tsx" `
    "components/customers/customer-form-dialog.tsx" `
    "app/settings/users/page.tsx" `
    "push_v3.74.725.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.724.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_725.txt"
    $msgLines = @(
        'feat(customers): v3.74.725 - shared customers, and parking with the owner',
        '',
        'The owner explained the ownership model: each employee is exclusively',
        'responsible for the customers he registers, invisible even to colleagues in',
        'the same branch, with duplicate phone numbers blocking re-registration.',
        'Deliberate, not a defect. Two cases it did not cover: a customer who visits',
        'another branch, and an employee moved out of a branch with no replacement.',
        '',
        'Checked the commission model before advising, and it changed the answer:',
        'commission is attributed to booking.current_responsible_user_id, the person',
        'who did the work - not to the customer''s owner. Transferring ownership',
        'moves no commission at all, past or future. The heaviest-looking constraint',
        'was not there.',
        '',
        'A flaw I introduced in v3.74.722: validate_customer_branch_isolation',
        'deliberately accepts a branchless customer on any branch''s document - so a',
        '"shared customer" has existed since yesterday - but my picker filtered on',
        'branch_id = mine exactly, hiding those customers from everyone. The',
        'database permitted what the interface concealed, leaving the system''s only',
        'multi-branch mechanism unusable. The filter now matches the guard.',
        '',
        'That third state was reachable only by leaving the branch blank, which',
        'nobody knew and the form rejected as a validation error. It is now a named',
        'option, saved as a real null.',
        '',
        'And when an employee leaves a branch that has no other staff, his customers',
        'move to the owner immediately: there is nobody to hand them to, and',
        'stranding them means nobody sees or serves them. Where a colleague does',
        'exist the existing prompt still asks - the decision stays with the owner',
        'wherever there is a decision to make.',
        '',
        'The owner spotted the gap immediately: parking deposits customers with him,',
        'but the source dropdown hid the current user - so they landed where no',
        'dropdown could reach them. We moved them somewhere safe and shut the door.',
        'The current user is now selectable as a transfer source. Checked the',
        'two-eye approval first: self-approval is blocked, but the single-senior',
        'exemption from v3.74.67 applies, so there is no deadlock.',
        '',
        'Still to build: claiming a customer by duplicate phone, with owner approval.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.725 pushed - shared customers and owner parking" -ForegroundColor Green
}
