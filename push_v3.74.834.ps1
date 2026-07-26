$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.833.ps1") { Remove-Item -LiteralPath "push_v3.74.833.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.834"') {
    Write-Host "+ 3.74.834" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.834]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.834]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260726000004_v3_74_833_release_freezes_material_snapshot.sql"
$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts",
    $mig,
    "scripts/check-migration-matches-db.js",
    ".github/workflows/ci.yml",
    "package.json",
    "push_v3.74.834.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.833.ps1" 2>$null

# ── the corrected 833 migration is what is actually live ─────────────────────
$m = Get-Content -LiteralPath $mig -Raw
foreach ($marker in @(
    "CREATE TRIGGER trg_refresh_material_requirement_issue_tracking",
    "mpoe_guard_material_requirement_immutability",
    "SUM(il.issued_qty)",
    "AND r.issued_quantity IS DISTINCT FROM i.iss",
    "v_sync := public.mpoe_sync_materials_internal(p_company_id, p_production_order_id, p_updated_by);")) {
    if ($m -notmatch [regex]::Escape($marker)) {
        Write-Host "X the 833 migration is STILL the stale draft - missing: $marker" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the 833 migration file now carries what was actually applied" -ForegroundColor Green

# the dangerous version read the derived column; make sure it is gone
if ($m -match "SUM\(COALESCE\(issued_quantity") {
    Write-Host "X the guard still reads the derived issued_quantity column - it would refuse every receipt" -ForegroundColor Red; exit 1
}
Write-Host "+ the receipt guard reads real issue lines, not the derived column" -ForegroundColor Green

$r = Get-Content -LiteralPath "app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts" -Raw
if ($r -notmatch [regex]::Escape('.from("production_order_issue_lines")')) {
    Write-Host "X the route does not read the real issue lines" -ForegroundColor Red; exit 1
}
Write-Host "+ the route reads the real issue lines too" -ForegroundColor Green

# ── the new guard must actually be wired in, not merely written ──────────────
$pkg = Get-Content -LiteralPath "package.json" -Raw
if ($pkg -notmatch [regex]::Escape("check:migration-db")) {
    Write-Host "X check-migration-matches-db.js is not wired into package.json scripts" -ForegroundColor Red; exit 1
}
$ci = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
if ($ci -notmatch [regex]::Escape("check:migration-db")) {
    Write-Host "X the new guard is not in CI - it would only ever run on my machine" -ForegroundColor Red; exit 1
}
Write-Host "+ the new guard is wired into package.json and CI" -ForegroundColor Green

# ── and it must pass: the files must describe the live database ──────────────
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

# ── the 833 lesson: verify the content in the INDEX, not the file on disk ────
# `git show :<path>` prints the staged blob itself, which is exactly what the
# commit will contain. Read it as ONE string: in PowerShell `-notmatch` against
# a string ARRAY filters it and returns the non-matching lines - a non-empty
# array is truthy, so an array-based check reports failure no matter what the
# content is. That mistake cost one aborted push already.
$stagedBlob = (git show ":$mig" 2>$null | Out-String)
if ([string]::IsNullOrWhiteSpace($stagedBlob)) {
    Write-Host "X the corrected migration is NOT staged - 833 would repeat itself" -ForegroundColor Red; exit 1
}
foreach ($marker in @(
    "trg_refresh_material_requirement_issue_tracking",
    "SUM(il.issued_qty)",
    "AND r.issued_quantity IS DISTINCT FROM i.iss")) {
    if (-not $stagedBlob.Contains($marker)) {
        Write-Host "X the STAGED migration is still the stale draft - missing: $marker" -ForegroundColor Red; exit 1
    }
}
$stagedLines = ($stagedBlob -split "`n").Count
if ($stagedLines -lt 250) {
    Write-Host "X the staged migration is only $stagedLines lines - the stale draft was 195" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged blob is the corrected migration ($stagedLines lines), not the draft" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_834.txt"
    $msgLines = @(
        'fix(migrations): v3.74.834 - a migration file must match the live',
        'database, and now a guard proves it',
        '',
        'Release 833 was pushed with a stale draft of its migration. The correct',
        'fix was applied to both databases and verified there, but the file git',
        'committed was an earlier version (195 lines instead of 301). The',
        'database was right; the repository was lying about it.',
        '',
        'The committed draft was not harmless. It creates a guard that reads',
        'production_order_material_requirements.issued_quantity and does NOT',
        'create the trigger that maintains that column. Applied to a fresh',
        'database it would refuse every product receipt in the system. A landmine',
        'with a plausible filename.',
        '',
        'The opposite direction happened the same day:',
        '20260508000200_allow_material_issue_tracking_updates had sat in the repo',
        'since May with neither its function nor its trigger present in',
        'production, so material-issue tracking was frozen at zero for months and',
        'partial-issue tracking, shortages and the purchase-order notification',
        'chain never worked at all.',
        '',
        'So the divergence runs both ways: a file that never reached the database,',
        'and a database that never reached the file. Neither is visible in a code',
        'review, a test run, or a diff. Only the database settles it.',
        '',
        'scripts/check-migration-matches-db.js takes the migration files changed',
        'in a release and, for every function they create, checks it exists in the',
        'live database and that the body matches once whitespace is normalised;',
        'for every trigger, that it exists on its table. On a mismatch it points',
        'at append-function-to-migration.js, which writes the definition straight',
        'from the database so the file was never a hand copy to begin with.',
        '',
        'Wired into package.json and CI, and into the push script with',
        '--require-db so a missing connection string is fatal rather than skipped.',
        'The push script also re-reads the STAGED migration content, because 833',
        'proved that verifying the working file is not the same as verifying what',
        'will actually arrive.',
        '',
        'Also corrected here: the 833 migration file now carries what is really',
        'running, and the receipt-request route reads production_order_issue_lines',
        'rather than the derived column.',
        '',
        'Two things the new guard caught immediately, on its first run:',
        '',
        '  - The migration file carried Arabic comments explaining why each guard',
        '    exists; the live functions did not. Rather than weaken the check to',
        '    ignore comments, both databases were re-aligned to the file text, so',
        '    the reasoning lives where the code runs. A migration should be a',
        '    record, not a hand copy.',
        '  - The staged-content check itself was wrong: `-notmatch` against a',
        '    PowerShell string ARRAY filters the array instead of returning a',
        '    boolean, and a non-empty result is truthy, so it failed regardless of',
        '    content. It now reads the staged blob via `git show :<path>` as one',
        '    string and also refuses anything under 250 lines, the stale draft',
        '    being 195.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.834 pushed - a migration file is a claim; now something checks it" -ForegroundColor Green
}
