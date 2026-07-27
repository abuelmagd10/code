$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.857.ps1") { Remove-Item -LiteralPath "push_v3.74.857.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.858"') {
    Write-Host "+ 3.74.858" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.858]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.858]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$prod  = "app/api/products/[id]/route.ts"
$wh    = "app/api/warehouses/route.ts"
$wo    = "app/api/write-offs/[id]/route.ts"
$page  = "app/products/page.tsx"
$guard = "scripts/check-request-body-written-raw.js"
$self  = "scripts/selftest-request-body-written-raw.js"

$files = @("lib/version.ts", "CHANGELOG.md", $prod, $wh, $wo, $page, $guard, $self,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.858.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.857.ps1" 2>$null

# ⚠️ -LiteralPath إلزامية هنا: الأقواس المربعة فى `[id]` أحرف نمطٍ فى
# PowerShell، فـ`Test-Path "app/api/products/[id]/route.ts"` يقرؤها كصنف
# أحرف (i أو d) ويعود False على ملفٍ موجود. أسقط هذا الدفعَ أولَ مرة.
foreach ($f in @($prod, $wh, $wo, $page, $guard, $self)) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

function Get-CodeOnly([string]$path) {
    $raw = Get-Content -LiteralPath $path -Raw
    $noBlock = [regex]::Replace($raw, "/\*[\s\S]*?\*/", "")
    ($noBlock -split "`n" | Where-Object { $_ -notmatch "^\s*//" }) -join "`n"
}

# ── 1. the routes must name their columns ──────────────────────────────────
# The browser decided the columns. /api/products-list adds a display-only
# branch_name (v3.74.637); "edit" copied the list row into the form; saving
# sent branch_name back; there is no such column, so PostgREST answered 400 -
# before any SQL, which is why the database logs were silent. Every product
# edit from that screen had been failing since 637.
foreach ($pair in @(@($prod, "WRITABLE_PRODUCT_COLUMNS"),
                    @($wh,   "WRITABLE_WAREHOUSE_COLUMNS"),
                    @($wo,   "WRITABLE_WRITE_OFF_COLUMNS"))) {
    $f = $pair[0]; $const = $pair[1]
    $code = Get-CodeOnly $f
    if ($code -notmatch [regex]::Escape($const)) {
        Write-Host "X $f has no explicit writable-column list" -ForegroundColor Red; exit 1
    }
    if ($code -match "\.\.\.\s*body\s*[,}]" -or $code -match "\.\.\.\s*payload\s*[,}]") {
        Write-Host "X $f still spreads the request body into a write" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the save routes name their columns instead of copying the body" -ForegroundColor Green

# ── 2. and the edit screen must not carry display-only fields back ─────────
$pg = Get-CodeOnly $page
$editBlock = [regex]::Match($pg, "const handleEdit[\s\S]{0,1600}")
if (-not $editBlock.Success) {
    Write-Host "X could not find handleEdit" -ForegroundColor Red; exit 1
}
if ($editBlock.Value -match "editData\s*:\s*any\s*=\s*\{\s*\r?\n?\s*\.\.\.\s*product") {
    Write-Host "X the edit form still copies the whole list row" -ForegroundColor Red
    Write-Host "  Then the next display-only field added to any list breaks saving again." -ForegroundColor Red
    exit 1
}
Write-Host "+ the edit form takes named fields, not the whole row" -ForegroundColor Green

# ── 3. THE GUARD MUST BE SEEN REFUSING ─────────────────────────────────────
# Reporting zero proves nothing. The self-test plants a raw-body route AND the
# nastier case - a pick-shaped function with no column list, which walked past
# the guard's first draft. 833, 845, 851, 853, 857 all shipped past sleeping guards.
Write-Host "Proving the raw-body guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

Write-Host "Checking no route writes the request body straight through..." -ForegroundColor Cyan
node scripts/check-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) { Write-Host "X raw-body writes remain" -ForegroundColor Red; exit 1 }

Write-Host "Checking no table is open to anonymous visitors..." -ForegroundColor Cyan
node scripts/check-anon-open-tables.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X tables are open to anon" -ForegroundColor Red; exit 1 }

Write-Host "Checking nobody is stranded without a company..." -ForegroundColor Cyan
node scripts/check-users-without-company.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X stranded-user check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the governance audit..." -ForegroundColor Cyan
node scripts/ai-governance-audit.js --ci
if ($LASTEXITCODE -ne 0) { Write-Host "X governance audit failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking finished-goods conversion cost..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking inventory movement coverage..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking no company-reading function is open to anonymous callers..." -ForegroundColor Cyan
node scripts/check-anon-reachable-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the security finding is not cleared" -ForegroundColor Red; exit 1 }

Write-Host "Verifying migrations against the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.857.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_858.txt"
    $msgLines = @(
        'fix(products): v3.74.858 - every product edit was failing, and not because of the image',
        '',
        'The owner reported "failed - error updating product" while editing a',
        'manufactured item and attaching an image. The browser showed a 500 from',
        'our own route; the database logs showed nothing at all.',
        '',
        'Nothing, because the rejection never reached the database. The network line',
        'gives it away: PATCH /rest/v1/products came back 400. PostgREST refuses an',
        'unknown column from its own schema cache before issuing any SQL - so no',
        'postgres error is ever logged. Re-running the identical update on',
        'production under the owner own identity, full payload, image included,',
        'succeeded three times out of three. The database was never the problem.',
        '',
        'The route wrote { ...body } exactly as the browser sent it. And the items',
        'screen loads from /api/products-list, which since v3.74.637 attaches a',
        'display-only branch_name taken from a join. Pressing "edit" copied the list',
        'row into the form, and saving sent branch_name back. There is no such',
        'column on products, so the whole update was refused.',
        '',
        'So it was never about the image, and never about the item being',
        'manufactured. Editing ANY item from that screen had been failing since 637.',
        'The generic message "error updating product" hid the cause completely.',
        '',
        'The gap is structural, not local: every display field added to any list -',
        'a branch name, a warehouse name, any computed label - becomes a time bomb',
        'in the matching save screen, and it only goes off when a user tries to',
        'save. Possibly a customer.',
        '',
        'Columns are now named explicitly. The browser does not decide what gets',
        'written to the database.',
        '',
        'A new standing guard, check:raw-body-writes, baseline zero, needs no',
        'database - it reads the source. It immediately found two more:',
        '',
        '  - app/api/warehouses copied the body through when creating a warehouse.',
        '    Not broken today - this route builds its governance fields by hand -',
        '    but carrying the same bomb: the first display field added to the',
        '    warehouses screen would have killed creation the same way.',
        '    Worth recording: I first claimed this route was ALREADY broken,',
        '    reasoning from how addGovernanceData behaves in general. Reading the',
        '    file showed an explicit comment saying this route does not use it.',
        '    Classification gets verified, never carried over.',
        '  - app/api/write-offs/[id] copied the body through, which in principle',
        '    let the browser write status, approved_by and journal_entry_id.',
        '    Those columns are now outside the writable list; they have their own',
        '    governed routes.',
        '',
        'And the guard was seen refusing - twice. The self-test plants a raw-body',
        'route, and also the nastier case: a function called pickFakeFields that',
        'simply returns what it was given. That one walked straight past the first',
        'draft of the guard. A name is not an allow-list, so the check now demands',
        'a literal column list in the file before it will accept the wrapper.',
        'The fifth time this session that a guard proved worthless until it was',
        'watched failing.',
        '',
        'No data was touched. Every production probe ran inside a rolled-back',
        'transaction and the item is unchanged: 65,000, zero images.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.858 pushed - the browser no longer decides the columns" -ForegroundColor Green
}
