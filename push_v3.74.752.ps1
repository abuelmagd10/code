$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.751.ps1") { Remove-Item -LiteralPath "push_v3.74.751.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.752"') {
    Write-Host "+ 3.74.752" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.752]")) { Write-Host "X CHANGELOG missing [3.74.752]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000011_v3_74_752_ic_critical_triggers.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# Every protection verified during this work must be on the watch list. Dropping
# one from here is how it goes back to being unwatched.
foreach ($fn in @('enforce_period_lock_header','enforce_period_lock_lines','fn_check_journal_balance',
                  'auto_create_cogs_journal','auto_reverse_cogs_on_sale_return',
                  'validate_customer_branch_isolation','validate_product_branch_isolation',
                  'protect_customer_branch_id')) {
    if ($m -notmatch [regex]::Escape("('$fn'")) {
        Write-Host "X $fn is no longer watched - disabling it would go unnoticed" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all critical protections on the watch list" -ForegroundColor Green

# Must detect DISABLED, not merely MISSING. A disabled trigger still exists in
# pg_trigger, so a presence-only check would report everything fine.
if ($m -notmatch "tgenabled = 'D'") {
    Write-Host "X the check no longer detects a DISABLED trigger - only a deleted one" -ForegroundColor Red; exit 1
}
Write-Host "+ detects disabled, not just missing" -ForegroundColor Green

# Keyed on the function, so renaming a trigger is not a false alarm.
if ($m -match "t\.tgname\s*=") {
    Write-Host "X the check keys on trigger NAMES - a rename would raise a false alarm" -ForegroundColor Red; exit 1
}
if ($m -notmatch "p\.proname = r\.fn") {
    Write-Host "X the check no longer keys on the enforcing function" -ForegroundColor Red; exit 1
}
Write-Host "+ keyed on the function, tolerant of renames" -ForegroundColor Green

if ($m -notmatch "'critical_triggers'") {
    Write-Host "X the check is not registered on the dashboard" -ForegroundColor Red; exit 1
}
Write-Host "+ registered as a dashboard check" -ForegroundColor Green

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

Write-Host "Refreshing the function snapshot..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X function dump failed" -ForegroundColor Red; exit 1 }

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "$mig" `
    "supabase/schema/functions.sql" `
    "push_v3.74.752.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.751.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_752.txt"
    $msgLines = @(
        'feat(integrity): v3.74.752 - watch the 26 triggers that enforce the model',
        '',
        'Set out to check whether the dormant payroll and fixed-asset modules could',
        'post into a closed accounting period. They cannot. I was wrong three times',
        'in a row getting there, and the third mistake is the one worth recording.',
        '',
        'I searched for validate_transaction_date; the helper is called',
        'validate_transaction_period. I concluded post_depreciation had no period',
        'check; it calls require_open_financial_period_db. And underneath both sat',
        'the real error: I assumed each function must check for itself.',
        '',
        'It does not. trg_period_lock_header and trg_period_lock_lines fire BEFORE',
        'every write to journal_entries and journal_entry_lines, so a closed period',
        'refuses the entry regardless of which function attempts it. Verified by',
        'inserting into a locked period and being refused. I had been auditing the',
        'wrong layer - asking whether each function checks, while the system',
        'enforces it centrally, which is the better design.',
        '',
        'But central enforcement concentrates the risk. 26 triggers now carry',
        'protections nothing else re-checks: period locks, double-entry balance,',
        'FIFO costing, branch isolation. ALTER TABLE ... DISABLE TRIGGER is one',
        'statement, it is a normal thing to do during a data fix, and forgetting to',
        'switch it back removes the protection silently. Writes keep succeeding and',
        'nothing says a word.',
        '',
        'ic_critical_triggers confirms all 26 are attached and enabled. It keys on',
        'the enforcing FUNCTION rather than the trigger name, so a rename is not a',
        'false alarm - what matters is that the enforcement is attached and on. And',
        'it detects DISABLED specifically, not just missing: a disabled trigger is',
        'still present in pg_trigger, so a presence check would report all clear.',
        '',
        'Proven to fire rather than assumed: disabling trg_period_lock_header made',
        'it report the protection as off, re-enabling returned it to clean. A check',
        'nobody has watched fail is a check nobody knows works.',
        '',
        'No defect found in the dormant modules. Recording that as a result, since',
        'a verified "this is sound" is worth as much as a fix and is a good deal',
        'more honest than inventing work.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.752 pushed - 26 protections now watched" -ForegroundColor Green
}
