$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.769.ps1", "push_v3.74.770.ps1")) {
    if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.771"') {
    Write-Host "+ 3.74.771" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($tag in @("[3.74.771]", "[3.74.770]")) {
    if ($cl -notmatch [regex]::Escape($tag)) { Write-Host "X CHANGELOG missing $tag" -ForegroundColor Red; exit 1 }
}
Write-Host "+ CHANGELOG documents 3.74.770 and 3.74.771" -ForegroundColor Green

# --- backups/ must never be committable ---------------------------------------
$gi = Get-Content -LiteralPath ".gitignore" -Raw
if ($gi -notmatch "(?m)^backups/") {
    Write-Host "X backups/ is not in .gitignore - a dump would publish every customer row" -ForegroundColor Red
    exit 1
}
New-Item -ItemType Directory -Force -Path "backups/_guardcheck" | Out-Null
Set-Content -LiteralPath "backups/_guardcheck/data.sql" -Value "SELECT 1;"
$ignored = git check-ignore "backups/_guardcheck/data.sql" 2>$null
Remove-Item -Recurse -Force "backups/_guardcheck" -ErrorAction SilentlyContinue
if (-not $ignored) { Write-Host "X git does NOT ignore backups/ - stop" -ForegroundColor Red; exit 1 }
Write-Host "+ backups/ proven ignored by git" -ForegroundColor Green

# --- every script must parse; checking one and not the others cost a run today -
foreach ($s in @("scripts/backup-production.js", "scripts/verify-backup.js",
                 "scripts/check-db-connection.js", "scripts/restore-into-test-db.js")) {
    if (-not (Test-Path $s)) { Write-Host "X missing $s" -ForegroundColor Red; exit 1 }
    node --check $s 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "X $s does not parse" -ForegroundColor Red; exit 1 }
}
Write-Host "+ all four backup scripts parse" -ForegroundColor Green

$backup = Get-Content -LiteralPath "scripts/backup-production.js" -Raw
$verify = Get-Content -LiteralPath "scripts/verify-backup.js" -Raw

# The filter that nearly corrupted the dump: it must skip whole STATEMENTS, and
# must refuse to hand over a file it failed to clean.
if ($backup -notmatch "inStatement") {
    Write-Host "X the exclusion filter must skip whole statements, not header lines" -ForegroundColor Red
    Write-Host "  208,591 orphaned value rows would attach to the previous INSERT." -ForegroundColor Red
    exit 1
}
if ($backup -notmatch "removed < 1000") {
    Write-Host "X the filter must fail when it removes almost nothing" -ForegroundColor Red; exit 1
}
# Never assume another tool's flags again.
if ($backup -notmatch "detectExcludeFlag") {
    Write-Host "X the exclude flag must be detected from --help, not assumed" -ForegroundColor Red; exit 1
}
# Retry connection drops only.
if ($backup -notmatch "isTransient") {
    Write-Host "X transient connection drops must be retried" -ForegroundColor Red; exit 1
}
if ($backup -notmatch 'execFileSync\("docker", \["info"\]') {
    Write-Host "X Docker must be checked up front, not after three failures" -ForegroundColor Red; exit 1
}
Write-Host "+ backup: statement-aware filter, flag detection, retries, docker precheck" -ForegroundColor Green

# Verification must judge the ROW COUNT. It once printed "you can rely on this"
# over a restore of zero rows.
if ($verify -notmatch "ROW_FLOOR") {
    Write-Host "X verification must fail when the data did not arrive" -ForegroundColor Red; exit 1
}
if ($verify -notmatch "Structure AND data both reproduce production") {
    Write-Host "X the success message must not claim reliability on structure alone" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch "batchDrop") {
    Write-Host "X the wipe must be batched - DROP SCHEMA CASCADE runs out of locks" -ForegroundColor Red
    exit 1
}
if ($verify -notmatch "session_replication_role = 'replica'") {
    Write-Host "X circular foreign keys require deferred FK checks during the data load" -ForegroundColor Red
    exit 1
}
Write-Host "+ verify: row floor, batched wipe, deferred FK checks" -ForegroundColor Green

# No credential may ride out on an error message from any of the four.
foreach ($pair in @(@("backup-production", $backup), @("verify-backup", $verify))) {
    if ($pair[1] -notmatch "redact") {
        Write-Host "X $($pair[0]) prints errors without redacting the connection URL" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ connection URLs redacted in error paths" -ForegroundColor Green

# --- the heartbeat -------------------------------------------------------------
$cron = Get-Content -LiteralPath "app/api/cron/system-integrity/route.ts" -Raw
if ($cron -notmatch "heartbeat: true") {
    Write-Host "X the integrity cron must record that it RAN, even when clean" -ForegroundColor Red
    Write-Host "  Otherwise 'healthy' and 'dead' both look like zero rows." -ForegroundColor Red
    exit 1
}
if ($cron -notmatch 'from\("companies"\)') {
    Write-Host "X the heartbeat needs every company id, not only ones with findings" -ForegroundColor Red
    exit 1
}
if ($cron -notmatch "heartbeat companies lookup") {
    Write-Host "X the heartbeat's own lookup must report its failure" -ForegroundColor Red; exit 1
}
Write-Host "+ integrity cron writes a per-company heartbeat" -ForegroundColor Green

$doc = Get-Content -LiteralPath "docs/DISASTER_RECOVERY.md" -Raw
foreach ($needle in @("نسخة التطبيق ليست بديلاً", "ليست نسخة حتى تُستعاد", "session_replication_role")) {
    if ($doc -notmatch [regex]::Escape($needle)) {
        Write-Host "X DISASTER_RECOVERY.md lost a required section" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ recovery doc carries all three lessons" -ForegroundColor Green

# Line-ending churn from the Windows environment touches ~167 docs and the schema
# snapshot. None of it is content and none of it belongs in this release; staging
# is explicit below, so it is left alone rather than reverted under the owner.
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

git rm --cached -q "backups/backup-2026-01-07T11-49-20.json" 2>$null

git add -- "lib/version.ts" "CHANGELOG.md" ".gitignore" `
    "app/api/cron/system-integrity/route.ts" `
    "scripts/backup-production.js" "scripts/verify-backup.js" `
    "scripts/check-db-connection.js" "scripts/restore-into-test-db.js" `
    "docs/DISASTER_RECOVERY.md" "push_v3.74.771.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.769.ps1" "push_v3.74.770.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_771.txt"
    $msgLines = @(
        'feat(recovery): v3.74.771 - a backup that proves itself, and a heartbeat',
        '',
        'The question that had been open for months now has an answer. A pg_dump',
        'backup restored into a clean project gives:',
        '',
        '  tables    249/249    functions 1208/1204',
        '  policies  799/797    triggers   507/501',
        '',
        'against the repo snapshot''s 5 triggers out of 501. The structure comes back',
        'in full.',
        '',
        'And the verification tool lied. It printed "you can rely on this" over a',
        'restore of ZERO rows: it checked tables, functions, policies and triggers,',
        'printed the row count as a bare line, and never judged it. A tool written',
        'to catch things that look like success committed exactly that. It now',
        'fails below half the expected rows.',
        '',
        'The data load died because of system_logs: 209,092 rows, 86.9% of the',
        'database, in a single INSERT of 100,000 values. The connection dropped at',
        'its last line and nothing after it loaded. The accounting data this backup',
        'exists to protect is under 1% of the volume - journal entry lines are 922',
        'rows. system_logs is excluded; audit_logs deliberately is not, since it is',
        'what an auditor asks for and the in-app backup already omits it.',
        '',
        'The first exclusion filter matched the three INSERT header lines and left',
        '208,591 orphaned value tuples behind, which would have attached to the',
        'preceding INSERT and loaded API request logs into an accounting table - a',
        'backup that restores cleanly and is silently wrong. Caught because the file',
        'size did not change: a filter claiming to remove 87% that shrinks nothing',
        'has removed nothing. It is statement-aware now and refuses to hand over a',
        'file when it strips fewer than 1000 lines.',
        '',
        'The heartbeat is the other half. This morning the integrity cron had',
        'written zero rows - correct, because we cleared every deviation yesterday',
        'and the loop only visits companies WITH findings. But that makes two states',
        'identical from outside: "the system is healthy" and "the cron is dead" both',
        'produce nothing. Same defect as v3.74.753 in different clothing - then it',
        'ran and could not write, now it can write and has nothing to say. One',
        'heartbeat row per company per night, so absence finally means something.',
        '',
        'Four more obstacles, each of which would also have appeared mid-disaster:',
        '--exclude-table-data is not a Supabase CLI flag (the script now reads',
        '--help instead of assuming), the pooler drops connections at random (retry,',
        'but only for connection errors), psql was not installed (used from the',
        'container the CLI had already pulled), DROP SCHEMA CASCADE exhausted the',
        'lock table (batched), and Docker was not running after a restart (checked',
        'up front, one line instead of sixty).',
        '',
        'Two more credential leaks closed. Passing the URL as an argument put it',
        'into every error message. Every path where an error reaches the terminal',
        'was checked across all four scripts, and two were exposed - one in a script',
        'unrelated to the change. Yesterday''s leaks were found after a password had',
        'already been printed; these were found by looking for where it could',
        'travel.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.771 pushed" -ForegroundColor Green
    Write-Host "  Start Docker Desktop, then: node scripts/backup-production.js" -ForegroundColor Cyan
}
