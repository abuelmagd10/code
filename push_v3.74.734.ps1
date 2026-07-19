$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.733.ps1") { Remove-Item -LiteralPath "push_v3.74.733.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.734"') {
    Write-Host "+ 3.74.734" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.734]")) { Write-Host "X CHANGELOG missing [3.74.734]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260719000736_v3_74_734_export_public_schema.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }

# The grants section is the reason this release exists. functions.sql cannot
# hold ACLs, so without it a rebuild restores every function with EXECUTE to
# PUBLIC and undoes v3.74.727-731.
$r = Get-Content -LiteralPath $mig -Raw
if ($r -notmatch "FUNCTION GRANTS") {
    Write-Host "X the exporter no longer captures function grants - a rebuild would reopen the lockdown" -ForegroundColor Red; exit 1
}
foreach ($section in @("CREATE POLICY", "pg_get_triggerdef", "pg_get_constraintdef")) {
    if ($r -notmatch [regex]::Escape($section)) {
        Write-Host "X the exporter no longer captures: $section" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ exporter covers policies, triggers, constraints and grants" -ForegroundColor Green

# Regenerate BOTH snapshots. The point of the release is that the repo reflects
# the database; committing a stale snapshot would defeat it on day one.
Write-Host "Refreshing schema snapshots..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X function dump failed" -ForegroundColor Red; exit 1 }
node scripts/dump-db-schema.js
if ($LASTEXITCODE -ne 0) { Write-Host "X schema dump failed" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/schema/schema.sql")) {
    Write-Host "X schema.sql was not produced" -ForegroundColor Red; exit 1
}
$snap = Get-Content -LiteralPath "supabase/schema/schema.sql" -Raw
if ($snap.Length -lt 500000) {
    Write-Host "X schema.sql is suspiciously small ($($snap.Length) chars) - refusing to commit a partial baseline" -ForegroundColor Red; exit 1
}
# Count "TRIGGER", not "CREATE TRIGGER": two of them are CONSTRAINT triggers
# (the double-entry balance enforcers) and would go uncounted otherwise.
$policies = ([regex]::Matches($snap, "CREATE POLICY")).Count
$triggers = ([regex]::Matches($snap, "TRIGGER")).Count
$grants   = ([regex]::Matches($snap, "GRANT EXECUTE")).Count
Write-Host "  policies=$policies triggers=$triggers fn-grants=$grants chars=$($snap.Length)" -ForegroundColor DarkGray
if ($policies -lt 700 -or $triggers -lt 450 -or $grants -lt 2000) {
    Write-Host "X snapshot under-reports production - not committing it as the baseline" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot regenerated and complete" -ForegroundColor Green

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
    "$mig" `
    "scripts/dump-db-schema.js" `
    "supabase/schema/schema.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.734.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.733.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_734.txt"
    $msgLines = @(
        'chore(db): v3.74.734 - snapshot the 3/4 of the database the repo never held',
        '',
        'Asked what this project needs to be enterprise-grade, I checked before',
        'answering, and my assumption was wrong for the fourth time today. I',
        'expected no tests and no CI. There are 34 test files, CI on every push, a',
        'pre-push hook, a governance audit and automatic deploy. The machinery is',
        'there and it is decent.',
        '',
        'What the check did find: the migration ledger and the repo have almost',
        'nothing in common. 661 versions recorded as applied, 529 file prefixes in',
        'supabase/migrations, and only 49 in both. Everything else went through the',
        'SQL editor or MCP, which record a timestamp rather than a filename - even',
        'today''s migrations are logged under names that do not match their files.',
        'The folder cannot tell anyone what production contains.',
        '',
        'functions.sql does mirror all 1196 routines, refreshed every release. But',
        'nothing mirrored the rest: 249 tables, 797 RLS policies, 501 triggers, 1202',
        'indexes, 1795 constraints, and every grant. The policies ARE the security',
        'model; the triggers are where FIFO and COGS actually fire. db_dump.sql and',
        'db_schema.sql have been 0 bytes since May.',
        '',
        'The sharpest part: pg_get_functiondef does not emit ACLs, so functions.sql',
        'structurally cannot hold what this session changed. Rebuilding from the',
        'repo would have recreated every function with the default EXECUTE to',
        'PUBLIC - silently undoing the v3.74.727-731 lockdown.',
        '',
        'export_public_schema() plus scripts/dump-db-schema.js now write',
        'supabase/schema/schema.sql covering all of it. The script refuses to',
        'overwrite the baseline if the export comes back short: a truncated snapshot',
        'committed as the reference is worse than a hard failure, because it',
        'under-reports production and nobody finds out.',
        '',
        'One detail worth keeping: counting triggers gave 499 against the database''s',
        '501. Rather than wave it off, I checked - two are CONSTRAINT triggers, so',
        'pg_get_triggerdef emits "CREATE CONSTRAINT TRIGGER". They are',
        'trg_enforce_journal_balance and trg_recurring_template_balance, the',
        'double-entry balance enforcers. The export was right; the tally was wrong.',
        'Both the script and the push guard now count "TRIGGER".',
        '',
        'Not claimed: that this file can rebuild the database. Proving that needs a',
        'restore into a scratch project and a comparison. Until then we can SEE what',
        'production holds, not recreate it - and that difference is the difference',
        'between documentation and disaster recovery.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.734 pushed - schema baseline now in the repo" -ForegroundColor Green
}
