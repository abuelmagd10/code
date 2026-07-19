$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.740.ps1") { Remove-Item -LiteralPath "push_v3.74.740.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.741"') {
    Write-Host "+ 3.74.741" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.741]")) { Write-Host "X CHANGELOG missing [3.74.741]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# No always-true assertions in test CODE. Deliberately excludes comment lines:
# the four rewritten files explain the placeholder they replaced, and a bare
# string match would reject its own documentation - which is the mistake I made
# in v3.74.726, .727, .733, .735 and .738.
$placeholders = Get-ChildItem -Path "tests" -Recurse -Include *.test.ts -ErrorAction SilentlyContinue |
    Select-String -Pattern '^(?!\s*(\*|//|/\*)).*expect\(\s*true\s*\)\.toBe\(\s*true\s*\)'
if ($placeholders) {
    Write-Host "X always-true assertions found in test code - these report PASSED while checking nothing:" -ForegroundColor Red
    $placeholders | Select-Object -First 10 | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" -ForegroundColor Red }
    Write-Host "  Use it.todo(name) instead, so the count stays honest." -ForegroundColor Red
    exit 1
}
Write-Host "+ no always-true assertions in test code" -ForegroundColor Green

# The four hollow files must stay hollow-but-honest: todo, not passing.
foreach ($f in @("security", "invoices", "inventory", "journal")) {
    $src = Get-Content -LiteralPath "tests/critical/$f.test.ts" -Raw
    if ($src -notmatch "it\.todo\(") {
        Write-Host "X tests/critical/$f.test.ts no longer reports its cases as todo" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ unimplemented cases declared as todo" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$out = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
Write-Host ($out -split "`n" | Select-Object -Last 8 | Out-String)
if ($out -notmatch "Tests\s+.*\btodo\b") {
    Write-Host "X vitest is not reporting any todo - the placeholders may be back to passing" -ForegroundColor Red
    exit 1
}
# The honest number. If this climbs back toward 82 without new real tests being
# written, something has quietly started passing again.
if ($out -match "(\d+)\s+passed") {
    $passed = [int]$Matches[1]
    if ($passed -gt 60) {
        Write-Host "X $passed tests report passed, expected around 50 real ones - check for new always-true assertions" -ForegroundColor Red
        exit 1
    }
    Write-Host "+ $passed real tests pass, the rest are declared todo" -ForegroundColor Green
} else {
    Write-Host "X could not read the vitest summary" -ForegroundColor Red; exit 1
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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "tests/critical/security.test.ts" `
    "tests/critical/invoices.test.ts" `
    "tests/critical/inventory.test.ts" `
    "tests/critical/journal.test.ts" `
    "tests/integration/api-security.test.ts" `
    "push_v3.74.741.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.740.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_741.txt"
    $msgLines = @(
        'test: v3.74.741 - 32 "passing" tests were asserting nothing',
        '',
        'Spotted in the v3.74.740 push output: inventory.test.ts printed "Supabase',
        'credentials not found - skipping tests" and then reported 9 passed. And 82',
        'tests finished in 55ms, which no database-touching suite does.',
        '',
        'Checking found 32 of the 82 critical cases were expect(true).toBe(true)',
        'with a TODO. Four entire files - security, invoices, inventory, journal -',
        'were placeholders end to end.',
        '',
        'Which means what I told the owner yesterday was wrong. I said tests/critical',
        'was the only real guard on this build. The real guard is 50 cases in two',
        'files, equity-governance and financial-integrity. The rest was decoration.',
        '',
        'A file called security.test.ts reporting "6 passed" while checking nothing',
        'is worse than no file at all. A missing file prompts the question; a false',
        'pass answers it wrongly, in the first place anyone looks. invoices.test.ts',
        'carried a header saying "any failure here is a functional BUG" while',
        'nothing in it could fail.',
        '',
        'Sharpest of all: api-security.test.ts held two placeholders for exactly the',
        'property that later broke - "should not accept companyId from query',
        'parameters". That is the bonuses GET hole from v3.74.737, compensation data',
        'readable by anyone. The green tick was sitting there the whole time.',
        '',
        'Converted to it.todo rather than deleted. The names are an accurate',
        'specification of invariants this system relies on, and writing them down',
        'has value before the bodies exist - but vitest now reports them as TODO,',
        'so the count stops lying: 50 passed, 32 todo.',
        '',
        'The invariants themselves are covered elsewhere and verified: company',
        'isolation in the API by the 112-route check with its own fixtures, in the',
        'database by assert_company_access on 88 functions tested behaviourally,',
        'and double-entry balance by trg_enforce_journal_balance. The coverage is',
        'real; it just does not live in these files.',
        '',
        'Third thing today that reported success while doing nothing: the repair',
        'tool, the disabled test tier, and now the test count itself.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.741 pushed - the test count tells the truth" -ForegroundColor Green
}
