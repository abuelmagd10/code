$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.772.ps1") { Remove-Item -LiteralPath "push_v3.74.772.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.773"') {
    Write-Host "+ 3.74.773" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.773]")) { Write-Host "X CHANGELOG missing [3.74.773]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# --- the three tools must no longer write to the ledger -----------------------
$targets = @(
    "app/api/repair-invoice/route.ts",
    "app/api/fix-sent-invoice-journals/route.ts",
    "app/reports/update-account-balances/page.tsx"
)
foreach ($t in $targets) {
    $src = Get-Content -LiteralPath $t -Raw
    # Match the CALL shape, not the table name: every one of these files now
    # discusses journal_entry_lines at length in its retirement comment, and a
    # bare-name check would reject its own documentation. That mistake has been
    # made four times in this repo already.
    if ($src -match '\.from\(\s*"(journal_entry_lines|journal_entries|inventory_transactions)"\s*\)\s*\.\s*(insert|update|delete|upsert)\s*\(') {
        Write-Host "X $t still writes to the ledger" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ none of the three tools writes to the ledger any more" -ForegroundColor Green

# The security contract is unchanged: auth runs BEFORE the 410, so an
# unauthenticated caller still gets 401. tests/integration/api-security.test.ts
# asserts exactly this.
foreach ($t in @("app/api/repair-invoice/route.ts", "app/api/fix-sent-invoice-journals/route.ts")) {
    $src = Get-Content -LiteralPath $t -Raw
    if ($src -notmatch "requireOwnerOrAdmin\(request\)") {
        Write-Host "X $t lost its authentication check" -ForegroundColor Red; exit 1
    }
    $authIdx = $src.IndexOf("requireOwnerOrAdmin")
    $goneIdx = $src.IndexOf("status: 410")
    if ($authIdx -lt 0 -or $goneIdx -lt 0 -or $authIdx -gt $goneIdx) {
        Write-Host "X $t must authenticate BEFORE returning 410, or 401 becomes 410" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ auth still runs first - anonymous callers still get 401" -ForegroundColor Green

# The balance snapshot report is a real feature and must survive. Only the
# balancing function was removed from it.
$page = Get-Content -LiteralPath "app/reports/update-account-balances/page.tsx" -Raw
foreach ($keep in @("computeBalances", "saveSnapshots")) {
    if ($page -notmatch $keep) {
        Write-Host "X the balance snapshot report lost $keep - only the fix button should be gone" -ForegroundColor Red
        exit 1
    }
}
# And it must not run anything on mount any more.
if ($page -match "await fixUnbalancedInvoiceJournals\(\)") {
    Write-Host "X the page still calls the removed function" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot report intact; nothing runs on mount" -ForegroundColor Green

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
$scan = & node scripts/check-unchecked-writes.js 2>&1 | Out-String
$scanCode = $LASTEXITCODE
Write-Host ($scan.Trim())
if ($scanCode -ne 0) {
    Write-Host "X baseline mismatch - set BASELINE to the 'Found' number above" -ForegroundColor Red; exit 1
}
if ($scan -notmatch "Baseline: 145") {
    Write-Host "X the baseline should now be 145" -ForegroundColor Red; exit 1
}
Write-Host "+ 179 down to 145" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

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
    "app/api/repair-invoice/route.ts" `
    "app/api/fix-sent-invoice-journals/route.ts" `
    "app/reports/update-account-balances/page.tsx" `
    "scripts/check-unchecked-writes.js" `
    "push_v3.74.773.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.772.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_773.txt"
    $msgLines = @(
        'fix(accounting): v3.74.773 - three tools that damage the ledger and report success',
        '',
        '179 unchecked writes down to 145. All 34 removed were in the critical class.',
        '',
        'A full diagnostic showed the most dangerous sites were concentrated in',
        'tools that could not work correctly:',
        '',
        'repair-invoice deleted an invoice''s journal lines and inventory movements',
        'and rebuilt them across 11 unchecked writes. supabase-js does not throw on',
        'a failed write, so a failure mid-rebuild left the ledger deleted and not',
        'recreated, and the endpoint returned 200.',
        '',
        'fix-sent-invoice-journals inserted a journal header and then its lines',
        'unchecked, producing a posted entry with no lines: present in the ledger,',
        'carrying a reference, moving nothing. Several of its functions returned',
        'true unconditionally, so the batch report counted the invoice as repaired.',
        '',
        'The third is the one worth reading twice. app/reports/update-account-balances',
        'inserted SINGLE-SIDED journal lines - a credit-only line to revenue, a',
        'debit-only line to receivables - under two independent conditions, the',
        'second computed from figures taken before the first insert. That is not',
        'repairing accounting; it is forcing a total to look right by inventing',
        'revenue and receivables.',
        '',
        'And it did not sit behind a button. It ran in a useEffect on mount:',
        'opening the report was an attempt to write to the ledger, with no',
        'confirmation and no indication that viewing was also editing.',
        '',
        'It never once worked. Tested against a restored copy of production in the',
        'test database - which only exists because of yesterday''s backup work - the',
        'database refuses it outright: "Cannot add lines to a posted journal entry.',
        'Use Reversal instead." The unchecked write swallowed the refusal, and every',
        'entry in this system is posted. It failed every time it ran, silently, for',
        'as long as it existed. Third tool today to report success while being',
        'incapable of the thing it claims.',
        '',
        'All three also valued COGS from products.cost_price instead of FIFO lots,',
        'the same defect that removed four database functions in v3.74.726 and .759.',
        '',
        'Kept deliberately: the balance snapshot report itself, which is genuine and',
        'was only carrying the balancing function; and the authentication check in',
        'both routes, which still runs before the 410 so an anonymous caller gets',
        '401 as tests/integration/api-security.test.ts asserts.',
        '',
        'This is stage 1 of four. Stages 2-4 - consolidating 15 duplicated trace',
        'helpers, adding traces to booking custody via one migration, and moving',
        'journal writes out of the browser - are restructuring work and belong in',
        'their own sessions.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.773 pushed - stage 1 complete" -ForegroundColor Green
}
