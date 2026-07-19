$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.741.ps1") { Remove-Item -LiteralPath "push_v3.74.741.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.742"') {
    Write-Host "+ 3.74.742" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.742]")) { Write-Host "X CHANGELOG missing [3.74.742]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# --- prove the fixed parser before relying on it -----------------------------
# The v3.74.741 guard used a bare "(\d+) passed", which matched the "Test Files"
# line. It read 2 instead of 50, and would have read 6 if all 82 went back to
# passing - sailing under a threshold of 60. The guard built to stop the fake
# count coming back would have waved it through.
function Read-PassedCount([string]$vitestOutput) {
    $clean = $vitestOutput -replace "\x1b\[[0-9;]*[A-Za-z]", ""
    $line = ($clean -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
    if (-not $line) { return -1 }
    if ($line -match "(\d+)\s+passed") { return [int]$Matches[1] }
    return -1
}

# Coloured exactly as vitest emits it, because the plain-text version passed
# while the real one did not.
$esc = [char]27
$sampleNow = "Test Files  2 passed | 4 skipped (6)`n      Tests  $esc[1m50 passed$esc[22m | 32 todo (82)"
$sampleBad = "Test Files  6 passed (6)`n      Tests  $esc[1m82 passed$esc[22m (82)"
if ((Read-PassedCount $sampleNow) -ne 50) {
    Write-Host "X parser misreads a normal coloured summary (got $(Read-PassedCount $sampleNow), expected 50)" -ForegroundColor Red; exit 1
}
if ((Read-PassedCount $sampleBad) -ne 82) {
    Write-Host "X parser would miss a regression back to 82 passing" -ForegroundColor Red; exit 1
}
Write-Host "+ summary parser survives colour codes and catches a regression to 82" -ForegroundColor Green

$placeholders = Get-ChildItem -Path "tests" -Recurse -Include *.test.ts -ErrorAction SilentlyContinue |
    Select-String -Pattern '^(?!\s*(\*|//|/\*)).*expect\(\s*true\s*\)\.toBe\(\s*true\s*\)'
if ($placeholders) {
    Write-Host "X always-true assertions found in test code:" -ForegroundColor Red
    $placeholders | Select-Object -First 10 | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" -ForegroundColor Red }
    exit 1
}
Write-Host "+ no always-true assertions in test code" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
Write-Host ($raw -split "`n" | Select-Object -Last 6 | Out-String)

# vitest colours its summary, so escape sequences sit between the words and any
# pattern spanning them fails. Strip them before reading anything. Matching
# against decorated text is the same mistake as matching a name instead of a
# shape - the thing on screen is not the thing in the string.
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""

$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) {
    Write-Host "X could not find the Tests summary line in vitest output" -ForegroundColor Red; exit 1
}
Write-Host "  parsed: $($testsLine.Trim())" -ForegroundColor DarkGray

if ($testsLine -notmatch "\btodo\b") {
    Write-Host "X the Tests line no longer reports todo - the placeholders may be passing again" -ForegroundColor Red; exit 1
}
if ($testsLine -match "(\d+)\s+passed") {
    $passed = [int]$Matches[1]
    if ($passed -gt 60) {
        Write-Host "X $passed tests report passed, expected ~50 - check for new always-true assertions" -ForegroundColor Red
        exit 1
    }
    Write-Host "+ $passed real tests pass, the rest declared todo" -ForegroundColor Green
} else {
    Write-Host "X could not read a passed count from: $testsLine" -ForegroundColor Red; exit 1
}

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

git add -- "lib/version.ts" "CHANGELOG.md" "push_v3.74.742.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.741.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_742.txt"
    $msgLines = @(
        'fix(ci): v3.74.742 - the guard I had just written read the wrong number',
        '',
        'The v3.74.741 push output said "+ 2 real tests pass" when vitest had',
        'reported 50. The guard matched a bare "(\d+) passed", which hits the',
        '"Test Files  2 passed | 4 skipped" line before reaching "Tests  50 passed |',
        '32 todo".',
        '',
        'Not cosmetic. That guard exists to stop the 32 placeholder tests coming',
        'back to life: fail if more than 60 report passing. Had they returned, the',
        'summary would read "Test Files 6 passed" and "Tests 82 passed" - and the',
        'guard would have read 6, compared it against 60, and let it through. The',
        'check built to prevent the fake count would have permitted exactly that.',
        '',
        'Verified both directions rather than assuming: on the current output the',
        'bare pattern reads 2 and the anchored one reads 50; on a regressed 82-pass',
        'run the bare pattern reads 6 and sails under the threshold while the',
        'anchored one reads 82 and stops. Both cases are asserted in the push script',
        'before the parser is used on anything real.',
        '',
        'Eighth instance in two days of matching something that resembles the target',
        'rather than the target: three guards caught their own comments, a counter',
        'counted TRIGGER inside GRANT lines, a rule rejected my own fix over a',
        'variable name, a probe read argv[1] instead of argv[2], and now a summary',
        'parser read the wrong line.',
        '',
        'The difference matters. The earlier seven all failed loudly - they blocked',
        'a push and announced themselves. This one failed silently, reporting',
        'success while measuring nothing, and only surfaced because a number in a',
        'passing run looked odd. Silent guards are the dangerous kind.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.742 pushed - the guard reads the right line" -ForegroundColor Green
}
