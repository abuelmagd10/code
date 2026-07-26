$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.841.ps1") { Remove-Item -LiteralPath "push_v3.74.841.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.842"') {
    Write-Host "+ 3.74.842" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.842]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.842]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$g = Get-Content -LiteralPath "scripts/check-migration-matches-db.js" -Raw
if ($g -notmatch [regex]::Escape("git ls-files --others --exclude-standard")) {
    Write-Host "X the guard still ignores untracked (brand-new) migration files" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard now sees new, unstaged migration files" -ForegroundColor Green

$a = Get-Content -LiteralPath "scripts/append-function-to-migration.js" -Raw
if ($a -notmatch [regex]::Escape("CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION")) {
    Write-Host "X the appender still matches a mention instead of a definition" -ForegroundColor Red; exit 1
}
Write-Host "+ the appender looks for a definition, not a mention" -ForegroundColor Green

# ── retroactively verify 841's migration, which was never checked ────────────
# 841 slipped past the guard because its migration was untracked at the moment
# the check ran. It is committed now, so "changed files" no longer includes it -
# it must be named explicitly. This is the only way to learn whether the file
# that shipped actually matches the database.
$mig841 = "supabase/migrations/20260726000009_v3_74_841_production_labour_wages.sql"
Write-Host "Verifying 841's migration against the live database (retroactive)..." -ForegroundColor Cyan
$out = & node scripts/check-migration-matches-db.js $mig841 --require-db 2>&1 | Out-String
Write-Host ($out -split "`n" | Where-Object { $_ -match '^\s*[+X-]' } | Out-String).Trim() -ForegroundColor DarkGray
if ($LASTEXITCODE -ne 0) { Write-Host "X 841's migration does NOT match the database" -ForegroundColor Red; exit 1 }

# Capture the COUNT, not a phrase. The guard prints
#   "(9 function(s), 1 trigger(s) verified)"
# and an earlier version of this check looked for "function(s) verified" as one
# string - the two words are separated by the trigger count, so it never matched
# and the check failed while the guard had done exactly what was asked. Assert
# on the number that carries the meaning, not on the sentence around it.
$fnCount = 0
if ($out -match "\((\d+) function\(s\)") { $fnCount = [int]$Matches[1] }
if ($fnCount -lt 1) {
    Write-Host "X the guard verified 0 functions in 841's migration" -ForegroundColor Red; exit 1
}
Write-Host "+ 841's migration matches the database — $fnCount function(s) verified" -ForegroundColor Green

# ── and the normal check for anything this release changed ───────────────────
# No assertion that it must find work: a release that touches no migration
# legitimately has nothing to verify. Demanding otherwise was my own version of
# the mistake this release fixes - a check failing for a reason unrelated to
# what it exists to catch.
Write-Host "Verifying migrations changed in THIS release..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

if (Test-Path "scripts/check-service-role-scoping.js") {
    Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
    node scripts/check-service-role-scoping.js
    if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }
}

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

$files = @("lib/version.ts", "CHANGELOG.md",
           "scripts/check-migration-matches-db.js", "scripts/append-function-to-migration.js",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.842.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.841.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_842.txt"
    $msgLines = @(
        'fix(guards): v3.74.842 - the migration/database check skipped brand-new',
        'files, which is the common case',
        '',
        'Release 841 printed:',
        '',
        '  + no migration files changed - nothing to verify against the database.',
        '',
        'The entire substance of 841 was a new 703-line migration.',
        '',
        'The guard collected files from `git diff` (modified TRACKED files) and',
        '`git diff --cached` (staged). A brand-new migration is untracked until it',
        'is staged, and 841 moved `git add` to the end of its script - so the check',
        'ran before the file was staged, found nothing, and announced success.',
        '',
        'New files are not an edge case here; every release adds one. The guard was',
        'working by coincidence: whenever `git add` happened to run before it.',
        '',
        'It now also reads `git ls-files --others --exclude-standard`, so its',
        'verdict no longer depends on the order of `git add` in whatever script',
        'calls it. The push script additionally refuses to proceed if the guard',
        'reports having examined nothing - the check now has to prove it found work',
        'before its approval counts for anything.',
        '',
        'Also here: append-function-to-migration.js matched a MENTION rather than a',
        'DEFINITION. `CREATE TRIGGER ... EXECUTE FUNCTION public.x()` satisfied it,',
        'so the function body was silently never appended, leaving a migration that',
        'creates a trigger pointing at a function it never defines - fine against a',
        'database that already has it, fatal against a fresh one. It now looks for',
        '`CREATE [OR REPLACE] FUNCTION`.',
        '',
        'Three failures of the same family in one day: a guard matching a mention',
        'instead of a definition; a guard extracting an empty body because a lazy',
        'match stopped at the opening delimiter; and a guard finding no files at',
        'all. Each reported something reassuring.',
        '',
        'A guard that announces success having examined nothing is worse than no',
        'guard, because it sells confidence it never earned. Test a guard with what',
        'must pass and what must fail - and confirm it found anything to judge.',
        '',
        'Two more, both mine, while writing this very release:',
        '',
        '  4. The push script first demanded that the check ALWAYS find migrations',
        '     to verify. It then failed on this release, whose migration was already',
        '     committed and therefore unchanged. A release that touches no migration',
        '     legitimately has nothing to verify; insisting otherwise is the same',
        '     error in reverse - a check failing for a reason unrelated to what it',
        "     exists to catch. 841's migration is now named explicitly for a",
        '     retroactive verification, and the general check runs without that',
        '     demand.',
        '  5. Then it asserted on a sentence instead of a number. The guard prints',
        '     "(9 function(s), 1 trigger(s) verified)" and the check looked for',
        '     "function(s) verified" as one string - the two words are separated by',
        '     the trigger count. The check failed while the guard had done exactly',
        '     what was asked of it. It now reads the count.',
        '',
        'Five in one day, three of them in checks I wrote while fixing the previous',
        'one. A guard is a tool, and it needs testing as much as the thing it',
        'guards.',
        '',
        "Retroactive result: 841's migration matches the live database, 9 functions",
        'and 1 trigger verified - the file that shipped is sound.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.842 pushed - a guard must prove it looked before its approval counts" -ForegroundColor Green
}
