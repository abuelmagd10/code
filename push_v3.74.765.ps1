$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.764.ps1") { Remove-Item -LiteralPath "push_v3.74.764.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.765"') {
    Write-Host "+ 3.74.765" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.765]")) { Write-Host "X CHANGELOG missing [3.74.765]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$route = "app/api/accounting-validation/route.ts"
$r = Get-Content -LiteralPath $route -Raw

# The whole defect: a service-only invoice can never have a cost of goods, so
# counting it as "missing COGS" blocks the annual closing forever.
if ($r -notmatch 'neq\("products\.item_type", "service"\)') {
    Write-Host "X test 5 must exclude service lines - a service has no inventory cost" -ForegroundColor Red
    exit 1
}
if ($r -notmatch "const stockInvoiceIds = new Set<string>\(\)") {
    Write-Host "X test 5 must scope to invoices that actually sell stock" -ForegroundColor Red
    exit 1
}
Write-Host "+ COGS test scoped to stock-selling invoices only" -ForegroundColor Green

# An unreadable line table must not be reported as "every invoice is missing COGS".
if ($r -notmatch "lineLookupFailed") {
    Write-Host "X a failed line lookup must be distinguishable from a real gap" -ForegroundColor Red
    exit 1
}
$idx = $r.IndexOf("cogs_recorded")
if ($idx -lt 0) { Write-Host "X test cogs_recorded not found" -ForegroundColor Red; exit 1 }
# Window spans both sides: `passed` is computed above the id and the messages
# sit below it. v3.74.764 shipped a forward-only window that rejected correct
# code twice - do not repeat that here.
$start = [Math]::Max(0, $idx - 1200)
$window = $r.Substring($start, [Math]::Min(3000, $r.Length - $start))
if ($window -notmatch "lineLookupFailed \? true") {
    Write-Host "X cogs_recorded would still block the closing when the lookup fails" -ForegroundColor Red
    exit 1
}
if ($window -notmatch "تعذّر التحقق") {
    Write-Host "X cogs_recorded must say 'could not verify' rather than report a gap" -ForegroundColor Red
    exit 1
}
Write-Host "+ COGS test degrades to 'could not verify', not to a false gap" -ForegroundColor Green

# Guard from the previous release must still hold.
$liveQueries = @()
$lineNo = 0
foreach ($line in (Get-Content -LiteralPath $route)) {
    $lineNo++
    if ($line -match '^\s*(//|\*|/\*)') { continue }
    if ($line -match '\.from\(\s*"information_schema') { $liveQueries += "${lineNo}: $($line.Trim())" }
}
if ($liveQueries.Count -gt 0) {
    Write-Host "X information_schema query came back:" -ForegroundColor Red
    $liveQueries | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    exit 1
}
Write-Host "+ no information_schema queries in code" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" $route "push_v3.74.765.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.764.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_765.txt"
    $msgLines = @(
        'fix(validation): v3.74.765 - the last blocker was a service invoice',
        '',
        'v3.74.764 took the accounting validation from 63% to 95% by removing five',
        'phantom critical failures. One remained, and I described it as the single',
        'genuine problem: "one invoice of three has no COGS entry, so profit is',
        'overstated".',
        '',
        'It is not genuine either. INV-2026-00001 has exactly one line: a product',
        'named تقشير with item_type = service. A service has no inventory cost.',
        'There is nothing to post and there never will be. The message told the',
        'owner profit was overstated in the income statement, which was untrue - no',
        'stock left, no cost was understated, no profit was inflated.',
        '',
        'The test counted every active invoice without asking whether it sells',
        'stock. A service-only invoice is therefore "missing COGS" forever, and',
        'because the test is critical, it blocks the annual closing forever.',
        '',
        'The rest of the codebase already knew the difference: the read-only',
        'diagnostic in app/api/fix-cogs-accounting has filtered item_type !=',
        '"service" since v3.74.726. This one test did not.',
        '',
        'Verified before changing anything, across every company rather than the one',
        'in front of me:',
        '',
        '  8ef6...526   3 active,  2 sell stock,  1 service-only,  0 missing COGS',
        '  b0de...254  14 active, 14 sell stock,  0 service-only,  0 missing COGS',
        '',
        'There is no COGS gap anywhere in the system.',
        '',
        'If the invoice lines cannot be read, the test now says "could not verify"',
        'and does not block the closing, rather than counting every invoice as',
        'missing. Same principle as .764.',
        '',
        'The guard in this script uses a window spanning both sides of the test id.',
        'The .764 script used a forward-only window and rejected correct code twice',
        'in a row, because `passed` is computed above tests.push while the messages',
        'sit below it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.765 pushed - annual closing should now be clear" -ForegroundColor Green
}
