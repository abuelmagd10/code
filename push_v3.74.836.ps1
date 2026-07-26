$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.835.ps1") { Remove-Item -LiteralPath "push_v3.74.835.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.836"') {
    Write-Host "+ 3.74.836" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.836]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.836]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260726000006_v3_74_836_signup_blocked_own_company.sql"
$files = @(
    "lib/version.ts", "CHANGELOG.md", $mig,
    "scripts/verify-signup-path.js", "package.json", ".github/workflows/ci.yml",
    "push_v3.74.836.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.835.ps1" 2>$null

$m = Get-Content -LiteralPath $mig -Raw

# --- the owner recorded on the company row is accepted ------------------------
if ($m -notmatch [regex]::Escape("SELECT 1 FROM companies`n    WHERE id = p_company_id AND user_id = v_uid")) {
    if ($m -notmatch [regex]::Escape("WHERE id = p_company_id AND user_id = v_uid")) {
        Write-Host "X the company owner is still not accepted - signup stays broken" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the company's own registered owner is accepted" -ForegroundColor Green

# --- membership is still honoured, and strangers still refused ---------------
if ($m -notmatch [regex]::Escape("SELECT 1 FROM company_members")) {
    Write-Host "X the membership check was dropped" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("USING ERRCODE = '57014'")) {
    Write-Host "X the refusal no longer uses 57014 - WHEN OTHERS could swallow it" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("غير مصرح: هذه العملية تخص شركة أخرى")) {
    Write-Host "X the refusal message is missing - the guard may no longer refuse anyone" -ForegroundColor Red; exit 1
}
Write-Host "+ membership still honoured, strangers still refused with 57014" -ForegroundColor Green

# --- the smoke test must use a REAL identity, not the service key -------------
$s = Get-Content -LiteralPath "scripts/verify-signup-path.js" -Raw
if ($s -notmatch [regex]::Escape("set_config('role', 'authenticated', true)")) {
    Write-Host "X the smoke test does not act as an authenticated user - it would always pass" -ForegroundColor Red; exit 1
}
if ($s -notmatch [regex]::Escape("request.jwt.claims")) {
    Write-Host "X the smoke test does not set an end-user identity" -ForegroundColor Red; exit 1
}
if ($s -notmatch [regex]::Escape('client.query("ROLLBACK")')) {
    Write-Host "X the smoke test does not roll back - it would litter production" -ForegroundColor Red; exit 1
}
Write-Host "+ the smoke test acts as a real user and rolls back" -ForegroundColor Green

# --- and it is wired in ------------------------------------------------------
if ((Get-Content -LiteralPath "package.json" -Raw) -notmatch [regex]::Escape("check:signup")) {
    Write-Host "X the smoke test is not in package.json" -ForegroundColor Red; exit 1
}
if ((Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw) -notmatch [regex]::Escape("check:signup")) {
    Write-Host "X the smoke test is not in CI" -ForegroundColor Red; exit 1
}
Write-Host "+ wired into package.json and CI" -ForegroundColor Green

# --- run it: a new customer must be able to create a company -----------------
Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the migration files match the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$stagedBlob = (git show ":$mig" 2>$null | Out-String)
if ([string]::IsNullOrWhiteSpace($stagedBlob) -or -not $stagedBlob.Contains("user_id = v_uid")) {
    Write-Host "X the staged migration is not the verified one" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged blob is the verified migration" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_836.txt"
    $msgLines = @(
        'fix(auth): v3.74.836 - a real customer could not create their own company',
        '',
        'The most severe defect of the session, because it stops the first screen a',
        'paying customer ever sees. All they saw was "failed to create company".',
        '',
        'The chain, taken from the error context in the database:',
        '',
        '  INSERT companies',
        '    -> trg_seed_company_accounts',
        '       -> seed_default_chart_of_accounts -> sync_company_chart_of_accounts',
        '          -> INSERT chart_of_accounts',
        '             -> audit_trigger_function -> create_audit_log',
        '                -> assert_company_access -> RAISE "not authorised"',
        '',
        'assert_company_access consulted company_members ALONE. The membership row',
        'is written by the client AFTER the company INSERT returns - so for the',
        'duration of that single statement the creator is a stranger to their own',
        'company, and every bootstrap trigger that writes an audit row kills the',
        'signup. The statement rolls back whole: no partial company, no trace. The',
        'funnel simply stops converting, silently.',
        '',
        'Nothing caught it. Type-checking cannot see database logic, the critical',
        'tests do not create companies, and under the service key the INSERT always',
        'succeeds because auth.uid() is null and the check returns immediately - so',
        'the path looked healthy from every console. The error was visible only to',
        'the person least able to report it.',
        '',
        'The fix also accepts the owner recorded on the company row itself',
        '(companies.user_id). That is not a security relaxation: it is the same',
        'person, recorded elsewhere - the membership row duplicates a fact already',
        'written on the company.',
        '',
        'Verified on production by simulating an authenticated user inside a',
        'transaction and rolling back:',
        '',
        '  before: "not authorised: this operation belongs to another company"',
        '  after:  insert succeeds - 94 accounts, 1 branch, 1 warehouse',
        '  a user who neither owns nor belongs to the company: still refused',
        '',
        'scripts/verify-signup-path.js now repeats that test on every release and',
        'in CI: it creates a company under a real user identity inside a',
        'transaction, asserts the bootstrap seeded accounts, branch and warehouse,',
        'then rolls back.',
        '',
        'One detail worth preserving: the raise uses ERRCODE 57014',
        '(query_canceled) deliberately, because PL/pgSQL WHEN OTHERS does not trap',
        'that class, so a calling function cannot swallow an authorisation failure',
        'by accident. That same property defeated my first verification attempt -',
        'WHEN OTHERS did not catch it - which is worth remembering rather than',
        'working around.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.836 pushed - customers can sign up again" -ForegroundColor Green
}
