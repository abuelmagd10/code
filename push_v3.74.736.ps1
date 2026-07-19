$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.735.ps1") { Remove-Item -LiteralPath "push_v3.74.735.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.736"') {
    Write-Host "+ 3.74.736" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.736]")) { Write-Host "X CHANGELOG missing [3.74.736]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The old three-file check must be gone, and the generic one wired in. Leaving
# the whitelist behind would let it drift back into being the real check.
$ci = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
if ($ci -notmatch "check-service-role-scoping\.js") {
    Write-Host "X CI no longer runs the service-role scoping check" -ForegroundColor Red; exit 1
}
if ($ci -match 'if ! grep -r "requireOwnerOrAdmin\\\|secureApiRequest"') {
    Write-Host "X the hand-written three-file whitelist is back in CI" -ForegroundColor Red; exit 1
}
Write-Host "+ CI runs the generic check, whitelist gone" -ForegroundColor Green

# The ratchet is the point. Without the fail-on-new and fail-on-stale halves
# this becomes an exemption list that grows quietly.
$js = Get-Content -LiteralPath "scripts/check-service-role-scoping.js" -Raw
if ($js -notmatch "UNREVIEWED") {
    Write-Host "X the ratchet list is gone" -ForegroundColor Red; exit 1
}
if ($js -notmatch "must be removed from UNREVIEWED") {
    Write-Host "X the script no longer fails when a route is cleaned up - the list would rot" -ForegroundColor Red; exit 1
}
if ($js -notmatch "NEW route") {
    Write-Host "X the script no longer fails on new violations - it would be advisory only" -ForegroundColor Red; exit 1
}
Write-Host "+ ratchet fails on new violations AND on stale entries" -ForegroundColor Green

Write-Host "Running the check itself..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the scoping check fails on the current tree - fix before pushing" -ForegroundColor Red; exit 1
}
Write-Host "+ check passes" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "scripts/check-service-role-scoping.js" `
    ".github/workflows/ci.yml" `
    "package.json" `
    "push_v3.74.736.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.735.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_736.txt"
    $msgLines = @(
        'security(ci): v3.74.736 - scoping check covers 112 routes instead of 3',
        '',
        'The CI security job named three files by hand and checked that an auth',
        'helper appeared in them. Two problems, both demonstrated by v3.74.733:',
        'three files out of 112 that use the service-role key, and it verified that',
        'the question was asked rather than that the answer was used.',
        'fix-negative-payments DID call requireOwnerOrAdmin, discarded its',
        'companyId, and rewrote payments for every tenant. It would have passed.',
        '',
        'The rule now: a route holding full database rights must be authenticated,',
        'and must scope its work to a company the caller cannot choose - or verify',
        'membership of the one they supplied.',
        '',
        'It took four attempts, and the failures are the interesting part. Draft 1',
        'asked which helpers were called and flagged customers/delete, which is fine',
        'because it verifies membership instead. Draft 2 learned that shape and',
        'flagged bills/[id]/journal-entry-id, which uses enforceGovernance() - a',
        'helper I had never seen. Draft 3 flagged billing/renew, authenticated by a',
        'signed HMAC token, a fourth mechanism. Every time I wrote a rule from my',
        'memory of this codebase, the codebase had a legitimate mechanism my memory',
        'did not contain. So the final version does not ask which helper was used at',
        'all; it asks whether the caller is authenticated and whether the company',
        'comes from somewhere they control.',
        '',
        '112 scanned, 16 exempt with a stated reason (cron, webhooks, pre-login',
        'invite flows), 13 flagged.',
        '',
        'Those 13 are a ratchet, not an exemption list. I have not read all of them',
        'and I am not going to bulk-edit accounting routes I have not read - that is',
        'how this class of bug gets created rather than removed. New violations fail',
        'the build immediately. The script ALSO fails if a listed route stops',
        'violating, which forces the list down instead of letting it become a place',
        'where problems are quietly parked. Being on it means "not yet examined",',
        'not "safe".'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.736 pushed - generic scoping check live" -ForegroundColor Green
}
