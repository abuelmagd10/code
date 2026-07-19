$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.744.ps1") { Remove-Item -LiteralPath "push_v3.74.744.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.745"') {
    Write-Host "+ 3.74.745" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.745]")) { Write-Host "X CHANGELOG missing [3.74.745]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

foreach ($f in @("scripts/verify-test-database.js", "docs/TEST_DATABASE_SETUP.md")) {
    if (-not (Test-Path $f)) { Write-Host "X missing: $f" -ForegroundColor Red; exit 1 }
}

# The verifier's whole job is refusing the wrong database. Prove both refusals
# rather than trusting the code reads correctly - a safety check nobody has seen
# fail is a safety check nobody has seen work.
Write-Host "Proving the verifier refuses an unset target..." -ForegroundColor Cyan
$env:TEST_SUPABASE_URL = $null
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = $null
& node scripts/verify-test-database.js *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "X the verifier passed with no test database configured" -ForegroundColor Red; exit 1
}
Write-Host "+ refuses when unset" -ForegroundColor Green

Write-Host "Proving the verifier refuses production..." -ForegroundColor Cyan
$env:TEST_SUPABASE_URL = "https://hfvsbsizokxontflgdyn.supabase.co"
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = "not-a-real-key"
$prodOut = & node scripts/verify-test-database.js 2>&1 | Out-String
$prodCode = $LASTEXITCODE
$env:TEST_SUPABASE_URL = $null
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = $null
if ($prodCode -eq 0 -or $prodOut -notmatch "PRODUCTION project") {
    Write-Host "X the verifier did not refuse the production project" -ForegroundColor Red; exit 1
}
Write-Host "+ refuses production" -ForegroundColor Green

# The doc must keep the order that matters and must not invite the mistake the
# whole release exists to prevent.
$doc = Get-Content -LiteralPath "docs/TEST_DATABASE_SETUP.md" -Raw
if ($doc -notmatch "schema\.sql" -or $doc -notmatch "functions\.sql") {
    Write-Host "X the setup guide no longer names both snapshot files" -ForegroundColor Red; exit 1
}
if ($doc -notmatch "test:db:verify") {
    Write-Host "X the guide does not tell the reader to verify before running tests" -ForegroundColor Red; exit 1
}
Write-Host "+ setup guide complete" -ForegroundColor Green

$pkg = Get-Content -LiteralPath "package.json" -Raw
if ($pkg -notmatch '"test:db:verify"') {
    Write-Host "X package.json has no test:db:verify script" -ForegroundColor Red; exit 1
}
Write-Host "+ npm script wired" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "scripts/verify-test-database.js" `
    "docs/TEST_DATABASE_SETUP.md" `
    "package.json" `
    "push_v3.74.745.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.744.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_745.txt"
    $msgLines = @(
        'chore(test): v3.74.745 - prepare the test database, verified before use',
        '',
        'The dashboard is clean: 7 findings became 3 became 0, confirmed from both',
        'sides - the checker returns nothing AND the three customers genuinely sit',
        'under the owner in the database, rather than an alert merely disappearing.',
        '',
        'That leaves one roadmap item, and it is not mine to complete: creating a',
        'Supabase project is a cost decision for the owner. So everything around it',
        'is ready and his part is minutes.',
        '',
        'The item is worth two things, and the second matters more. It switches on 58',
        'dormant test cases, yes. But restoring schema.sql and functions.sql into an',
        'empty project is also the PROOF that those snapshots can rebuild the',
        'database - which has never been demonstrated. And if the restore fails, it',
        'fails on an empty project rather than during a real disaster.',
        '',
        'npm run test:db:verify checks four things before any test touches anything:',
        'that the target is not production, that it is reachable, that the schema is',
        'actually there, and that the restore was complete rather than partial.',
        '',
        'The third check earns its place. Pointed at an EMPTY project, every test',
        'would fail on missing tables and look exactly like a code defect - someone',
        'could spend a day diagnosing the wrong thing before noticing the restore',
        'never happened. The two failure modes point in opposite directions, and one',
        'command now says which you have.',
        '',
        'Proven rather than assumed: exits 1 with nothing configured, and exits 1',
        'naming the production project when aimed at it. The push guard runs both',
        'sabotage cases before every release - a safety check nobody has watched',
        'fail is a safety check nobody has watched work.',
        '',
        'Also removed a dead block from my own script: a query counting functions',
        'whose result was discarded. The count is already implied by',
        'export_public_schema() answering at all. A probe whose result is ignored is',
        'worse than no probe - which is the same fault corrected in v3.74.740, .741',
        'and .742.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.745 pushed - see docs/TEST_DATABASE_SETUP.md" -ForegroundColor Green
}
