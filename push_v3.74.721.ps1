$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.720.ps1") { Remove-Item -LiteralPath "push_v3.74.720.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.721"') {
    Write-Host "+ 3.74.721" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.721]")) { Write-Host "X CHANGELOG missing [3.74.721]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

# The transfer dialog must open on the branch change itself, pre-filled.
if ($usr -notmatch "setShowPermissionDialog\(true\)") {
    Write-Host "X the transfer dialog does not open on a branch move" -ForegroundColor Red; exit 1
}
if ($usr -notmatch "setTransferBranchId\(previousBranchId\)") {
    Write-Host "X the branch is not pre-selected - the transfer would default to All" -ForegroundColor Red; exit 1
}
Write-Host "+ transfer dialog opens pre-filled with the branch left behind" -ForegroundColor Green

# The explanation must live inside the transfer dialog, next to the fields it warns about.
if ($usr -notmatch "strandedInfo && permissionAction === 'transfer'") {
    Write-Host "X the explanation banner is not rendered inside the transfer dialog" -ForegroundColor Red; exit 1
}
Write-Host "+ explanation renders inside the transfer form" -ForegroundColor Green

# Context must clear on close or it bleeds into an unrelated transfer later.
if ($usr -notmatch "setShowPermissionDialog\(v\); if \(!v\) setStrandedInfo\(null\)") {
    Write-Host "X branch-move context is not cleared when the dialog closes" -ForegroundColor Red; exit 1
}
Write-Host "+ context cleared on close" -ForegroundColor Green

# No dead code left behind by replacing the standalone dialog.
if ($usr -match "false && strandedInfo") {
    Write-Host "X dead code left from the removed standalone notice" -ForegroundColor Red; exit 1
}
Write-Host "+ no dead code from the replaced notice" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "app/settings/users/page.tsx" "push_v3.74.721.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.720.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_721.txt"
    $msgLines = @(
        'feat(users): v3.74.721 - open the transfer form on a branch move, explanation inside it',
        '',
        'The owner asked for the permission-transfer form to open as soon as an',
        'employee changes branch, with the explanation shown.',
        '',
        'When the change strands customers, the transfer dialog now opens straight',
        'away, pre-filled with the source employee, resource type Customers, and the',
        'branch he left. The explanation moved from a separate notice into a banner',
        'inside that dialog.',
        '',
        'Inside rather than before, because the two failure modes are silent ones:',
        'using Share Permissions instead of Transfer Ownership, and leaving Branch on',
        '"All", which quietly moves the employee''s other branches too. Neither shows',
        'an error - the transfer just succeeds wrongly. Putting the warning inside',
        'places it next to the very fields it is about, and removes the extra click a',
        'preceding dialog would have cost on the common path.',
        '',
        'The banner states the count and branch, that everything is pre-filled and',
        'only the receiving colleague is missing, and that deferring is safe because',
        'the dashboard check keeps reporting those customers.',
        '',
        'The standalone dialog was removed outright - no dead code, no false-guarded',
        'block. The context clears when the dialog closes so it cannot bleed into an',
        'unrelated transfer opened later.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.721 pushed - transfer opens with its explanation" -ForegroundColor Green
}
