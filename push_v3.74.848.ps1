$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.847.ps1") { Remove-Item -LiteralPath "push_v3.74.847.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.848"') {
    Write-Host "+ 3.74.848" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.848]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.848]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$svc = "lib/currency-service.ts"
$files = @("lib/version.ts", "CHANGELOG.md", $svc,
           "scripts/check-phantom-selects.js",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.848.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.847.ps1" 2>$null

$s = Get-Content -LiteralPath $svc -Raw
# Comments stripped before judging an absence - the comments here NAME the
# phantom columns they replaced. Ninth time the project has hit this trap.
$sCode = (($s -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*)' }) -join "`n"

# ── 1. the phantom columns must be gone ────────────────────────────────────
if ($sCode -match "account_type,\s*balance") {
    Write-Host "X currency-service still selects chart_of_accounts.balance - no such column" -ForegroundColor Red; exit 1
}
if ($sCode -match "not\('balance'") {
    Write-Host "X currency-service still filters on a balance column that does not exist" -ForegroundColor Red; exit 1
}
Write-Host "+ no read of a column the chart of accounts does not have" -ForegroundColor Green

# ── 2. the balance must be DERIVED, the project's approved rule ─────────────
# opening_balance + (debits - credits) over POSTED entries. A stored balance is
# not merely absent here, it is forbidden - so the fix must compute, not add a
# column.
foreach ($need in @("opening_balance", "journal_entry_lines", "debit_amount", "credit_amount")) {
    if ($sCode -notmatch [regex]::Escape($need)) {
        Write-Host "X the balance is not derived from the ledger - missing: $need" -ForegroundColor Red; exit 1
    }
}
if ($sCode -notmatch "'status',\s*'posted'") {
    Write-Host "X draft entries would move a balance - posted-only filter missing" -ForegroundColor Red; exit 1
}
Write-Host "+ balances derived from posted journal entries, as the rest of the system does" -ForegroundColor Green

# ── 3. a failed read must never report success ─────────────────────────────
# This is the whole bug: the SELECT failed and the function answered
# {success:true, gain:0, loss:0}, so a base-currency change silently posted no
# revaluation at all while the screen carried on.
$failPaths = ([regex]::Matches($sCode, 'success:\s*false')).Count
if ($failPaths -lt 4) {
    Write-Host "X too few error paths ($failPaths): a failed query can still be reported as success" -ForegroundColor Red; exit 1
}
Write-Host "+ every failed query returns success:false, not a silent zero" -ForegroundColor Green

# ── 4. chunked .in() - thousands of ids exceed the URL limit ────────────────
if ($sCode -notmatch "CHUNK") {
    Write-Host "X the entry-id lookup is not chunked; it will fail once the company has real history" -ForegroundColor Red; exit 1
}
Write-Host "+ the ledger read is chunked and will survive a real ledger" -ForegroundColor Green

# ── 5. the ratchet moved DOWN ──────────────────────────────────────────────
$sel = Get-Content -LiteralPath "scripts/check-phantom-selects.js" -Raw
if ($sel -notmatch 'PHANTOM_SELECT_BASELINE \?\? 9') {
    Write-Host "X the phantom-select baseline is not 9 - it must ratchet down, never up" -ForegroundColor Red; exit 1
}
Write-Host "+ read baseline 11 -> 9" -ForegroundColor Green

# ── 6. and the guards must still be able to FAIL ───────────────────────────
Write-Host "Proving the guards can still fail..." -ForegroundColor Cyan
$probe1 = "scripts/phantom-probe.tmp.ts"
@'
import { createClient } from "@supabase/supabase-js"
const s = createClient("x", "y")
export const q = () => s.from("employees").select("id, definitely_not_a_real_column")
'@ | Set-Content -LiteralPath $probe1 -Encoding UTF8
node scripts/check-phantom-selects.js *> $null
$e1 = $LASTEXITCODE
Remove-Item -LiteralPath $probe1 -Force -ErrorAction SilentlyContinue

$probe2 = "scripts/acct-probe.tmp.ts"
'const q = { account_code: "9999" }
export default q' | Set-Content -LiteralPath $probe2 -Encoding UTF8
node scripts/check-hardcoded-account-codes.js *> $null
$e2 = $LASTEXITCODE
Remove-Item -LiteralPath $probe2 -Force -ErrorAction SilentlyContinue

if ($e1 -eq 0) { Write-Host "X the phantom-select guard is asleep" -ForegroundColor Red; exit 1 }
if ($e2 -eq 0) { Write-Host "X the account-code guard is asleep" -ForegroundColor Red; exit 1 }
Write-Host "+ both guards fail when they should" -ForegroundColor Green

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
git add -u -- "push_v3.74.847.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env")  { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "probe")  { Write-Host "X a probe file leaked into the commit" -ForegroundColor Red; exit 1 }
if ((Test-Path $probe1) -or (Test-Path $probe2)) { Write-Host "X a probe file was not cleaned up" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_848.txt"
    $msgLines = @(
        'fix(accounting): v3.74.848 - currency revaluation reported success while',
        'doing nothing at all',
        '',
        'performCurrencyRevaluation read chart_of_accounts.balance and',
        '.currency_code. Neither column exists, so the SELECT failed, `accounts`',
        'came back null, and the function returned:',
        '',
        '    { success: true, totalGain: 0, totalLoss: 0, revaluedAccounts: 0 }',
        '',
        'It reported SUCCESS. Changing the company base currency therefore',
        'converted every displayed amount and posted no revaluation entry at all,',
        'while the settings screen carried on as though the whole thing had worked.',
        '',
        'The missing `balance` column is not an oversight - it is the rule. This',
        'project treats a balance as derived, never stored: opening_balance plus',
        'debits minus credits over POSTED entries, exactly as /api/account-balances',
        'computes it, and that file is marked as approved accounting logic. So the',
        'fix is to compute the balance from the ledger, not to add the column.',
        'Same decision as 847 took for payroll: the ledger is the record, and a',
        'field beside it is a second truth that can disagree.',
        '',
        'Verified against production: the balances this now computes match the',
        'trial balance, including inventory at 199.27 - the figure checked',
        'independently earlier in this series.',
        '',
        'Three things tightened while fixing it:',
        '',
        '  A failed query no longer reports success. Every read path returns',
        '  success:false with its message. Announcing success for a read that',
        '  failed is the entire bug, not a detail of it.',
        '',
        '  Draft entries no longer move a balance - posted only.',
        '',
        '  The entry-id lookup is chunked at 500. An .in() over thousands of ids',
        '  exceeds the URL length limit and fails the request, which is precisely',
        '  how this family of silent failures begins.',
        '',
        'Phantom-read baseline 11 -> 9. The nine that remain are not renames: the',
        'subscription screen (companies.max_users / monthly_cost /',
        'subscription_plan) and commission-to-payroll attachment (commission_*)',
        'have code written against columns that were never created. Creating them',
        'or dropping the features is a product decision, so they stay on the',
        'baseline rather than being guessed at.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.848 pushed - no more success reported for work never done" -ForegroundColor Green
}
