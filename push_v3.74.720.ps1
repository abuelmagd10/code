$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.719.ps1") { Remove-Item -LiteralPath "push_v3.74.719.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.720"') {
    Write-Host "+ 3.74.720" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.720]")) { Write-Host "X CHANGELOG missing [3.74.720]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

if ($usr -notmatch "strandedInfo") {
    Write-Host "X the stranded-customers notice is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ stranded-customers notice present" -ForegroundColor Green

# It must only fire when the employee actually LEFT a branch. Without the
# previousBranchId guard it would also fire when assigning a branch to someone
# who never had one, which strands nothing.
if ($usr -notmatch "previousBranchId && previousBranchId !== memberBranchId") {
    Write-Host "X the notice is not gated on an actual branch change" -ForegroundColor Red; exit 1
}
Write-Host "+ fires only on a real move between branches" -ForegroundColor Green

# The count must be narrowed to the OLD branch. Dropping that filter would count
# every customer the employee ever created and overstate the problem.
if ($usr -notmatch '\.eq\("branch_id", previousBranchId\)') {
    Write-Host "X the count is not scoped to the branch the employee left" -ForegroundColor Red; exit 1
}
Write-Host "+ count scoped to the branch left behind" -ForegroundColor Green

# The whole point of the shortcut is landing on Transfer Ownership, not Share.
if ($usr -notmatch "setPermissionAction\('transfer'\)") {
    Write-Host "X the shortcut does not open the Transfer Ownership tab" -ForegroundColor Red; exit 1
}
Write-Host "+ shortcut opens Transfer Ownership pre-filled" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "app/settings/users/page.tsx" "push_v3.74.720.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.719.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_720.txt"
    $msgLines = @(
        'feat(users): v3.74.720 - explain what a branch move leaves behind, and how to hand it over',
        '',
        'The owner asked for a message at the moment an employee changes branch,',
        'explaining how to transfer the customers tied to the old branch.',
        '',
        'The timing is the point. Staff see customers they created, scoped to their',
        'branch, so moving an employee strands every customer he created in the',
        'branch he left: he can no longer see them, nobody in that branch can',
        'either - none of them created those records - and documents for those',
        'customers are refused from his new branch. The original case surfaced weeks',
        'after the fact, by chance. Catching it at creation removes that gap.',
        '',
        'After a successful branch change, counts the customers the employee created',
        'in the branch he just left. If any, a dialog explains what happened with',
        'numbers, lists the five transfer steps - flagging the two things that go',
        'wrong: it is the Transfer Ownership tab, not Share Permissions, and the',
        'branch must be selected or the transfer takes his other branches too - and',
        'offers a button that opens the transfer dialog pre-filled with this exact',
        'case.',
        '',
        'It does not block or delay the move: moving staff is legitimate, so the',
        'message informs after the save succeeds. It stays quiet when there is',
        'nothing stranded, and when a branch is assigned to someone who had none. It',
        'also says deferring is safe, because the dashboard check keeps reporting',
        'those customers until ownership moves.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.720 pushed - branch move explains what it stranded" -ForegroundColor Green
}
