$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.754.ps1") { Remove-Item -LiteralPath "push_v3.74.754.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.755"') {
    Write-Host "+ 3.74.755" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.755]")) { Write-Host "X CHANGELOG missing [3.74.755]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$js = Get-Content -LiteralPath "scripts/check-unchecked-writes.js" -Raw
if ($js -notmatch "FIXTURES") {
    Write-Host "X the self-test fixtures are gone - the rule could drift unnoticed" -ForegroundColor Red; exit 1
}
if ($js -notmatch "BASELINE") {
    Write-Host "X the ratchet baseline is gone" -ForegroundColor Red; exit 1
}
Write-Host "+ fixtures and ratchet present" -ForegroundColor Green

$ci = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
if ($ci -notmatch "check-unchecked-writes\.js") {
    Write-Host "X CI does not run the unchecked-writes check" -ForegroundColor Red; exit 1
}
Write-Host "+ wired into CI" -ForegroundColor Green

# Prove the fixtures bite: break the rule in a scratch copy and confirm the
# self-test rejects it, rather than trusting that it would.
Write-Host "Proving the self-test fails on a broken rule..." -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP "broken-writes-check.js"
$broken = $js -replace [regex]::Escape("const isUnchecked = (line) =>"), "const isUnchecked = (line) => false && "
[System.IO.File]::WriteAllText($tmp, $broken)
$out = & node $tmp 2>&1 | Out-String
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
if ($out -notmatch "The rule itself is broken") {
    Write-Host "X a deliberately broken rule still passed the self-test" -ForegroundColor Red; exit 1
}
Write-Host "+ self-test rejects a broken rule" -ForegroundColor Green

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
$scan = & node scripts/check-unchecked-writes.js 2>&1 | Out-String
$scanCode = $LASTEXITCODE
Write-Host ($scan.Trim())
if ($scanCode -ne 0) {
    Write-Host "" -ForegroundColor Yellow
    Write-Host "The baseline in scripts/check-unchecked-writes.js does not match reality." -ForegroundColor Yellow
    Write-Host "Set BASELINE to the 'Found' number above and run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "+ no new unchecked writes" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

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
    "scripts/check-unchecked-writes.js" `
    ".github/workflows/ci.yml" `
    "package.json" `
    "push_v3.74.755.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.754.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_755.txt"
    $msgLines = @(
        'ci: v3.74.755 - stop the silent-write pattern from growing',
        '',
        'Four defects fixed today share one root cause: supabase-js does not throw',
        'on a failed write, it returns { error }. A write whose result is discarded',
        'therefore does nothing at all when it fails, and execution continues as if',
        'it had worked.',
        '',
        '  v3.74.726  a repair tool called a function that does not exist and',
        '             reported success',
        '  v3.74.743  customer branch reassignment failed for every owner, for as',
        '             long as the trigger had existed',
        '  v3.74.753  the nightly integrity cron wrote zero audit rows and zero',
        '             notifications, ever, and returned 200 each night',
        '  v3.74.754  the FX revaluation reminder never reached anyone',
        '',
        'None announced itself. All four reported success.',
        '',
        '213 call sites discard their result. I estimated 96, from a search that',
        'covered app/ with a .ts filter and silently skipped lib/ and .tsx -',
        'more than half the codebase. The script reporting the real number is the',
        'only reason the baseline is not permanently wrong by 117.',
        '',
        'They are not equal, and the list should not be worked top to bottom. Most',
        'are audit-log inserts, where a failure is annoying. The dangerous ones are',
        'rollback paths that delete journal entries after a failed operation -',
        'manual-journal, customer-refund, shareholder-capital, bank-transfer and',
        'period-closing. If one of those deletes fails quietly the compensation',
        'never happens and a half-written entry survives a failed transaction.',
        'That is accounting integrity, not logging, and it is where to start.',
        '',
        'I am not rewriting 213 call sites at the end of a long day - that is',
        'precisely the kind of sweep that breaks one thing while fixing another,',
        'and I have made that mistake more than once today already.',
        '',
        'So: a ratchet, the same shape that worked for the service-role scoping',
        'check. New violations fail the build. A DROP in the count also fails,',
        'until the baseline is lowered to match - otherwise a gain is made once and',
        'quietly given back later.',
        '',
        'Seven self-test fixtures pin both ends of the rule and run on every',
        'invocation. Two of them are comment lines, specifically because guards',
        'written this week kept rejecting their own documentation by matching prose',
        'as if it were code. The push script breaks the rule deliberately first and',
        'confirms the fixtures catch it.',
        '',
        'The lesson worth keeping: a write that failed and a write with nothing to',
        'do look identical unless you ask about the result.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.755 pushed - the pattern is now fenced" -ForegroundColor Green
}
