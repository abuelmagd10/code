$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.743.ps1") { Remove-Item -LiteralPath "push_v3.74.743.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.744"') {
    Write-Host "+ 3.74.744" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.744]")) { Write-Host "X CHANGELOG missing [3.74.744]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$u = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

# Source and target lists are mirrors. v3.74.725 opened the source to the
# current user and left the target closed, which made transferring TO the owner
# - the entire point of parking stranded customers with him - impossible by
# hand. Both directions must stay open for a transfer.
if ($u -match "m\.user_id !== selectedSourceUser && !m\.is_current") {
    Write-Host "X the target list excludes the current user again - customers cannot be handed to the owner" -ForegroundColor Red; exit 1
}
if ($u -notmatch "permissionAction === 'transfer' \|\| !m\.is_current") {
    Write-Host "X the source list no longer admits the current user" -ForegroundColor Red; exit 1
}
# Anchor on a string that occurs exactly once. The first attempt split on
# "الموظفين الهدف", which appears 4 times - twice in toast messages long before
# the JSX - so [1] returned the text between the two toasts and the check failed
# on correct code. Tenth time in two days I matched something that merely
# resembles the target.
$anchor = "Target employees (multiple allowed)"
if (([regex]::Matches($u, [regex]::Escape($anchor))).Count -ne 1) {
    Write-Host "X anchor '$anchor' is no longer unique - this check would read the wrong region" -ForegroundColor Red; exit 1
}
$targetRegion = ($u -split [regex]::Escape($anchor))[1]
if ($targetRegion -notmatch "permissionAction === 'transfer' \|\| !m\.is_current") {
    Write-Host "X the target list does not admit the current user for a transfer" -ForegroundColor Red; exit 1
}
Write-Host "+ owner selectable as both source and target of a transfer" -ForegroundColor Green

# Count the occurrences so the two lists cannot drift apart again: one in the
# source picker, one in the target picker.
$mirrors = ([regex]::Matches($u, "permissionAction === 'transfer' \|\| !m\.is_current")).Count
if ($mirrors -ne 2) {
    Write-Host "X expected the current-user rule in BOTH lists, found $mirrors occurrence(s)" -ForegroundColor Red; exit 1
}
Write-Host "+ both lists carry the same rule (2 occurrences)" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed" -and [int]$Matches[1] -gt 60) {
    Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1
}
Write-Host "+ critical tests as expected" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" "app/settings/users/page.tsx" "push_v3.74.744.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.743.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_744.txt"
    $msgLines = @(
        'fix(permissions): v3.74.744 - the owner could not RECEIVE a transfer',
        '',
        'The branch corrections worked and the dashboard went from 7 findings to 3,',
        'exactly as predicted, leaving the three مدينة نصر customers whose creator',
        'moved to الفرع الرئيسي.',
        '',
        'The integrity check tells you to fix them via Settings > Users > Transfer',
        'Ownership. Before passing that on I checked the route was actually',
        'walkable. It was not: the target list filters out the current user, and the',
        'only correct destination for these three is the owner, because their branch',
        'has no staff at all.',
        '',
        'This is my own half-finished fix. In v3.74.725 I made the current user',
        'selectable as the SOURCE, because the auto-park deposits stranded customers',
        'with the owner and he then needs to hand them on. I wrote at the time that',
        'the customers were being "deposited somewhere no dropdown could reach" - and',
        'then left the opposite direction closed. Transferring TO the owner, which',
        'is the entire point of parking, remained impossible by hand.',
        '',
        'It went unnoticed because the code does it automatically during a branch',
        'change. Anything predating that feature was stuck, which is precisely the',
        'state these three are in.',
        '',
        'The lesson is the symmetry, not the symptom: source and target are mirrors,',
        'and a restriction on one has to be reconsidered on the other. The push',
        'guard now asserts the rule appears in BOTH lists rather than merely',
        'somewhere in the file.',
        '',
        'Also verified the whole path end to end before recommending it: all three',
        'customers share one staff creator, the destination is the owner, and the',
        'company has exactly one owner - so the two-eye approval falls under the',
        'single-senior exemption from v3.74.67 and he can approve his own request.',
        'No dead end at the far side either.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.744 pushed - transfers can now reach the owner" -ForegroundColor Green
}
