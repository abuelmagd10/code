$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.851.ps1") { Remove-Item -LiteralPath "push_v3.74.851.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.852"') {
    Write-Host "+ 3.74.852" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.852]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.852]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$inv = "app/inventory/page.tsx"
$grd = "scripts/check-inventory-movement-coverage.js"

$files = @("lib/version.ts", "CHANGELOG.md", $inv, $grd,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.852.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.851.ps1" 2>$null

$p = Get-Content -LiteralPath $inv -Raw

# ── 1. the four pieces every new column needs ──────────────────────────────
# A bucket alone changes nothing on screen; a column alone shows nothing; a
# state pair alone is dead. All four, or the column is half-built.
foreach ($piece in @(
    'productionIssueAgg', 'productionReceiptAgg',                 # aggregation buckets
    'setProductionIssueTotals', 'setProductionReceiptTotals',      # state setters
    "type === 'production_issue'", "type === 'production_receipt'" # classification
)) {
    if ($p -notmatch [regex]::Escape($piece)) {
        Write-Host "X the inventory page is missing: $piece" -ForegroundColor Red; exit 1
    }
}
foreach ($h in @("مصروف للتصنيع", "وارد من التصنيع")) {
    if ($p -notmatch [regex]::Escape($h)) {
        Write-Host "X the column header '$h' is missing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both manufacturing columns are wired end to end" -ForegroundColor Green

# ── 2. the footer must have one cell per column ────────────────────────────
# v3.74.716 had to repair exactly this: two columns added without their totals
# left the footer two cells short, and every figure after write-offs rendered
# under the wrong heading. Counting is cheap; a shifted report is not.
$colCount  = ([regex]::Matches($p, "key:\s*['""][a-zA-Z_]+['""],\s*\r?\n\s*header:")).Count
$footCount = ([regex]::Matches($p, '<td className="px-4 py-4 text-center" data-ai-help="inventory\.[a-z_]+"')).Count
if ($colCount -eq 0) {
    Write-Host "X could not count the columns - the check would pass blindly" -ForegroundColor Red; exit 1
}
# sku and name are the two columns with no total of their own.
if (($colCount - $footCount) -ne 2) {
    Write-Host "X $colCount column(s) but $footCount footer cell(s) - expected a gap of exactly 2 (sku, name)." -ForegroundColor Red
    Write-Host "  Every figure after the missing cell would appear under the wrong heading." -ForegroundColor Red
    exit 1
}
Write-Host "+ $colCount columns / $footCount footer cells - the totals row lines up" -ForegroundColor Green

# ── 3. and the totals must be the new ones, not copies ─────────────────────
foreach ($t in @("total_production_issue", "total_production_receipt")) {
    if ($p -notmatch [regex]::Escape($t)) {
        Write-Host "X the footer cell '$t' is missing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both manufacturing totals are in the footer" -ForegroundColor Green

# ── 4. the guard must be able to FAIL ──────────────────────────────────────
# Reporting "all covered" proves nothing until the guard has been seen refusing
# the very omission it exists for. Remove one classification and it must break.
Write-Host "Proving the movement-coverage guard can fail..." -ForegroundColor Cyan
$bak = Join-Path $env:TEMP "inventory_page_852.bak"
Copy-Item -LiteralPath $inv -Destination $bak -Force
(Get-Content -LiteralPath $inv -Raw).Replace("type === 'production_issue'", "type === '__removed__'") |
    Set-Content -LiteralPath $inv -Encoding UTF8 -NoNewline
node scripts/check-inventory-movement-coverage.js --require-db *> $null
$probeExit = $LASTEXITCODE
Copy-Item -LiteralPath $bak -Destination $inv -Force
Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue
if ($probeExit -eq 0) {
    Write-Host "X the guard did NOT fail with production_issue unclassified - it is asleep" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard fails when a live movement type loses its column" -ForegroundColor Green

# the restore must be byte-for-byte, or the probe just corrupted the page
$after = Get-Content -LiteralPath $inv -Raw
if ($after -notmatch [regex]::Escape("type === 'production_issue'")) {
    Write-Host "X the page was not restored after the probe - STOP" -ForegroundColor Red; exit 1
}
Write-Host "+ the page is restored intact" -ForegroundColor Green

Write-Host "Checking every live movement type has a column..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.851.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_852.txt"
    $msgLines = @(
        'fix(inventory): v3.74.852 - manufacturing movements had no column, so the',
        'stock report did not add up',
        '',
        'The owner was reading rows like these:',
        '',
        '  قاعدة ماتور   bought 3, sold 0, no returns, no write-offs, available 0',
        '  ماتور مجهز    bought 0, sold 1',
        '',
        'Three units bought and vanished with nothing saying where, and a product',
        'sold that had never been bought, as though it had appeared from nowhere.',
        '',
        'production_issue and production_receipt have been moving stock for months',
        'and appeared in no column: -6 and +3 in this company alone. Two columns',
        'now sit beside Service Use and In Custody - raw material issued to a',
        'production order, and finished goods received back from it. Verified',
        'against production: for all eight products, purchases + received from',
        'production - sales - returns - service use - issued to production -',
        'custody - available = 0. Every row closes.',
        '',
        'This is the THIRD time this exact defect has shipped:',
        '',
        '  714  custody and service movements changed stock with no column',
        '  716  then those columns were added WITHOUT their footer cells, so every',
        '       figure after write-offs rendered under the wrong heading',
        '  852  and manufacturing repeated it',
        '',
        'It recurs because adding a movement type in the database forces nobody to',
        'add a column for it. So check-inventory-movement-coverage.js now compares',
        'the movement types actually present in the database against the types the',
        'page classifies, and fails the build on any type that moves stock without',
        'a column. It reads the database, not just the code - the lesson from 851,',
        'where a code-only guard reported zero while production held 15 duplicated',
        'invoice notifications.',
        '',
        'The 716 lesson is kept too: the footer is hand-built, one cell per column,',
        'so both totals were added and the push script asserts the counts line up -',
        '15 columns, 13 footer cells, the gap of exactly 2 being sku and name.',
        '',
        'Governance is unchanged. Both columns are derived from',
        'inventory_transactions, the same source as every other column, under the',
        'same branch, warehouse and permission filters. No new query, no new route,',
        'no new permission.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.852 pushed - every row in the stock report now adds up" -ForegroundColor Green
}
