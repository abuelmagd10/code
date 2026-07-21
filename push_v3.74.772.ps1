$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.771.ps1") { Remove-Item -LiteralPath "push_v3.74.771.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.772"') {
    Write-Host "+ 3.74.772" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.772]")) { Write-Host "X CHANGELOG missing [3.74.772]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$verify = Get-Content -LiteralPath "scripts/verify-backup.js" -Raw
node --check "scripts/verify-backup.js" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "X verify-backup.js does not parse" -ForegroundColor Red; exit 1 }

# The session setting must ride in the connection URL. Passing it as -c let the
# Windows shell split it at the first space; psql received the word "SET", the
# FK deferral never activated, and the load happened to succeed anyway. A
# protection that is off while appearing to work is the worst state available.
if ($verify -match '"-c", extraCommand') {
    Write-Host "X the session setting is back on the command line - the shell splits it" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch 'options=" \+ encodeURIComponent') {
    Write-Host "X the session setting must travel inside the connection URL" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch "-c session_replication_role=replica") {
    Write-Host "X libpq options syntax expected: -c setting=value, no spaces or quotes" -ForegroundColor Red
    exit 1
}
Write-Host "+ FK deferral travels in the URL, untouched by the shell" -ForegroundColor Green

# The wipe loop must be unable to spin forever.
if ($verify -notmatch "removed === before") {
    Write-Host "X the wipe loop needs a no-progress exit or it hangs on undroppable objects" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch "d\.objid IS NULL") {
    Write-Host "X extension-owned functions must be excluded from the wipe" -ForegroundColor Red
    exit 1
}
Write-Host "+ wipe loop has two independent exits" -ForegroundColor Green

# psql output must stream. Capturing it deadlocks on the NOTICE flood.
if ($verify -notmatch 'stdio: \["ignore", "ignore", "inherit"\]') {
    Write-Host "X psql output must stream, not be captured - it hangs on a 3.5 MB schema" -ForegroundColor Red
    exit 1
}
# The backup script is the opposite case and must keep capturing, or the retry
# logic goes blind - which it silently did.
$backup = Get-Content -LiteralPath "scripts/backup-production.js" -Raw
if ($backup -notmatch 'stdio: \["ignore", "ignore", "pipe"\][\s\S]{0,200}encoding: "utf8"') {
    Write-Host "X the backup must capture stderr, or retries cannot detect a dropped connection" -ForegroundColor Red
    exit 1
}
Write-Host "+ output handling: verify streams, backup captures - both deliberate" -ForegroundColor Green

# Row expectations must come from the public schema only, and the per-table
# comparison must exist.
if ($verify -match "PRODUCTION_ROWS = 239872") {
    Write-Host "X the row floor still includes auth and storage schemas" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch "CRITICAL_TABLES") {
    Write-Host "X per-table comparison is what proves the business came back" -ForegroundColor Red
    exit 1
}
foreach ($t in @("journal_entry_lines", "invoices", "chart_of_accounts")) {
    if ($verify -notmatch $t) {
        Write-Host "X $t must be among the critical tables checked" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ nine accounting tables compared exactly, scope corrected to public" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

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

git add -- "lib/version.ts" "CHANGELOG.md" `
    "scripts/verify-backup.js" "scripts/backup-production.js" `
    "push_v3.74.772.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.771.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - it contains production data. STOP." -ForegroundColor Red
    exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_772.txt"
    $msgLines = @(
        'fix(recovery): v3.74.772 - the first proven backup this project has had',
        '',
        '  tables    249/249    functions 1208/1204',
        '  policies  799/797    triggers   507/501',
        '',
        '  companies    4/4    invoices        18/18    journal_entries    89/89',
        '  customers   22/22   invoice_items 161/161    journal_lines    922/922',
        '  payments    30/30   products         9/9     chart_of_accounts 367/367',
        '',
        'Nine accounting tables, exact to the row.',
        '',
        'The last defect was the instructive one. The FK deferral was passed as',
        '-c "SET session_replication_role = \x27replica\x27;". These commands run through',
        'the Windows shell, which split the argument at its first space, so psql',
        'received the single word SET and answered "syntax error at end of input".',
        '',
        'The data loaded anyway, because the order pg_dump happened to choose did',
        'not violate any circular foreign key. A real success for a false reason -',
        'the protection was never active, everything looked correct, and no check',
        'can catch that shape. It would have held until a dump came out in a',
        'slightly different order, which is to say until the day it mattered. The',
        'setting now travels inside the connection URL where no shell touches it.',
        '',
        'Found because the owner pasted the whole output instead of the green line',
        'at the bottom.',
        '',
        'Two more, both mine. The wipe loop spun forever at 96 functions: 149 are',
        'owned by Postgres extensions and cannot be dropped, so each pass re-fetched',
        'the same rows and failed on all of them. My exit condition was "the work',
        'succeeded" with nothing to cover the case where it does not. It now',
        'excludes extension-owned functions AND stops on any pass that makes no',
        'progress - the second guard covers reasons I have not thought of.',
        '',
        'And capturing psql output to keep the console tidy deadlocked the script on',
        'the NOTICE flood from a 3.5 MB schema restore; the database showed 249',
        'tables and 1208 functions already in place, so the work had finished and',
        'only the script was stuck. Worse, switching the BACKUP script to streaming',
        'yesterday had silently blinded its retry logic, which reads the error text -',
        'no retry ever fired on a dropped connection. A safety net that cannot see',
        'the fall is not a safety net. verify streams, backup captures, each for its',
        'own reason.',
        '',
        'Neither hang was reported by any check. Both were noticed by the owner',
        'saying it had been sitting there a long time. Silence that looks like work',
        'is the last thing tooling sees.',
        '',
        'Also: the row floor had been built from pg_stat_user_tables across every',
        'schema, folding in 18,165 rows of auth that a public-schema dump never',
        'contains, and reporting a complete restore as 60% short. Replaced with',
        'exact per-table counts that do not depend on statistics being fresh.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.772 pushed" -ForegroundColor Green
    Write-Host "  Now copy backups\2026-07-21T09-29-39 somewhere off this machine." -ForegroundColor Cyan
}
