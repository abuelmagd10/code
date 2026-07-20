$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.768.ps1") { Remove-Item -LiteralPath "push_v3.74.768.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.769"') {
    Write-Host "+ 3.74.769" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.769]")) { Write-Host "X CHANGELOG missing [3.74.769]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# dump-db-schema.js must now state a MEASURED RESULT, not a caution.
#
# The first version of this block did `if ($dump -match "NOT yet proven")` and
# rejected the release — because the new comment QUOTES that old sentence in
# order to say it has been replaced. Third time today a push guard has refused
# its own documentation: the information_schema check in v3.74.764 and the
# window check right after it did exactly the same thing.
#
# The pattern is clear enough now to act on rather than narrow again. A negative
# check ("this text must not appear") cannot tell a live claim from a quoted
# one, and honest documentation quotes what it corrects. So this asserts what
# must be TRUE instead of what must be absent. Positive checks do not have this
# failure mode.
$dump = Get-Content -LiteralPath "scripts/dump-db-schema.js" -Raw
if ($dump -notmatch "PROVEN, 2026-07-20") {
    Write-Host "X dump-db-schema.js must state the measured result, not a caution" -ForegroundColor Red
    exit 1
}
if ($dump -notmatch "triggers  501  -> 5") {
    Write-Host "X the measured result must stay recorded in dump-db-schema.js" -ForegroundColor Red; exit 1
}
if ($dump -notmatch "6,045 failed") {
    Write-Host "X the failure count must stay recorded" -ForegroundColor Red; exit 1
}
if ($dump -notmatch "supabase db dump") {
    Write-Host "X the script must point at pg_dump as the real recovery path" -ForegroundColor Red; exit 1
}
Write-Host "+ dump-db-schema.js records the measured failure, not a caution" -ForegroundColor Green

$restore = Get-Content -LiteralPath "scripts/restore-into-test-db.js" -Raw
if ($restore -notmatch "6,045 failed") {
    Write-Host "X restore-into-test-db.js must record the first run's result" -ForegroundColor Red; exit 1
}
# The masking bugs are the reason this file can be run again safely. Both fixes
# must survive: mask to the LAST @, and mask even when there is no @ at all.
if ($restore -notmatch "lastIndexOf\(""@""\)") {
    Write-Host "X the password mask must split on the LAST @, or an @ in the password leaks it" -ForegroundColor Red
    exit 1
}
if ($restore -notmatch "no credentials found") {
    Write-Host "X the mask must also cover the malformed case - that is the only case it runs in" -ForegroundColor Red
    exit 1
}
# Production must never be a restore target.
if ($restore -notmatch 'PRODUCTION_REF = "hfvsbsizokxontflgdyn"') {
    Write-Host "X the production refusal must stay" -ForegroundColor Red; exit 1
}
Write-Host "+ restore script records the result, masks safely, refuses production" -ForegroundColor Green

# Nothing in this release may change the snapshot — it only records findings
# about it. functions.sql shows as fully rewritten (9702 lines added, 9702
# removed) with ZERO content difference: `git diff --ignore-all-space` is empty,
# so it is line endings, not data. Same thing happened to the invoice edit page
# in v3.74.758. Restore it rather than commit 19,404 lines of nothing.
git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

$snapChanged = git diff --name-only -- "supabase/schema/" 2>$null
if ($snapChanged) {
    Write-Host "X the snapshot still differs after restore - inspect before shipping:" -ForegroundColor Red
    $snapChanged | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    exit 1
}
Write-Host "+ snapshot untouched - this release documents, it does not regenerate" -ForegroundColor Green

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
    "scripts/dump-db-schema.js" "scripts/restore-into-test-db.js" `
    "push_v3.74.769.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.768.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_769.txt"
    $msgLines = @(
        'docs(recovery): v3.74.769 - the snapshot does NOT rebuild the database',
        '',
        'dump-db-schema.js has carried this sentence since it was written: "NOT yet',
        'proven to rebuild the database on its own; that requires restoring it into',
        'a scratch project and comparing."',
        '',
        'The test was run against a fresh empty project. It failed.',
        '',
        '  10,916 statements    4,871 applied    6,045 failed',
        '',
        '  tables    249 -> 243      policies  797 -> 429',
        '  functions 1204 -> 1053    triggers  501 -> 5',
        '',
        'Five triggers out of 501. Triggers are where COGS posting, journal balance',
        'enforcement and FIFO consumption live. A database restored from this file',
        'accepts data and silently stops doing accounting, with under half its',
        'row-level security in place, so it also leaks between companies.',
        '',
        'The worst part is not the failures. 4,871 statements SUCCEEDED, so the',
        'result would have LOOKED like a working system. An outright failure stops',
        'you and makes you investigate; a plausible-looking one has you resume',
        'trading on a broken database.',
        '',
        'Five structural causes, none of them patchable:',
        '  - no dependency ordering: foreign keys emitted before the primary keys',
        '    they reference, so most constraints fail',
        '  - extensions never emitted        (type "vector" does not exist)',
        '  - enum types never emitted        (type "discount_document_type" ...)',
        '  - sequences never emitted         (relation "..._id_seq" does not exist)',
        '  - column DEFAULTs calling functions that schema.sql loads before',
        '    functions.sql',
        '',
        'Plus one fidelity bug worth naming: audit_logs.entity and entity_id are',
        'GENERATED ALWAYS columns and the dump writes them as DEFAULT expressions.',
        'Postgres rejected it, which is lucky - accepted, the restored table would',
        'have behaved differently from production with nothing reporting it.',
        '',
        'The file keeps its real job: seeing what production contains and diffing',
        'it. That already paid for itself today, catching a checked-in copy still',
        'granting three dropped dangerous functions to anon. For actual recovery the',
        'answer is pg_dump - supabase db dump - which handles ordering, extensions,',
        'types and sequences by design. This script must not grow into pg_dump.',
        '',
        'Four obstacles were hit before the restore even began: a special character',
        'in the database password, a # silently truncating the .env line, and an',
        'IPv6-only direct host unreachable from an IPv4 network. Every one of those',
        'would also have been hit during a real recovery, under pressure, with no',
        'explanation offered.',
        '',
        'The test database has now paid for itself on its first run.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.769 pushed - the recovery gap is now measured and recorded" -ForegroundColor Green
}
