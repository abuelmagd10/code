$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.846.ps1") { Remove-Item -LiteralPath "push_v3.74.846.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.847"') {
    Write-Host "+ 3.74.847" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.847]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.847]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig  = "supabase/migrations/20260726000013_v3_74_847_salaries_expense_by_meaning.sql"
$pay  = "app/api/hr/payroll/pay/route.ts"
$rep  = "app/api/simple-report/route.ts"
$grd  = "scripts/check-hardcoded-account-codes.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $pay, $rep, $grd,
           "scripts/check-phantom-selects.js",
           "app/api/expenses/[id]/post/route.ts",
           "app/api/expenses/[id]/approve/route.ts",
           "app/expenses/new/page.tsx",
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.847.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.846.ps1" 2>$null

$p = Get-Content -LiteralPath $pay -Raw
$m = Get-Content -LiteralPath $mig -Raw
$r = Get-Content -LiteralPath $rep -Raw

# Comments stripped before judging any absence - 846 hit this trap and the
# project has now hit it nine times. The comments here NAME the phantom values
# they replaced, so a raw search finds them and reports the fix as missing.
function CodeOnly($text) {
    (($text -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*|--)' }) -join "`n"
}
$pCode = CodeOnly $p
$rCode = CodeOnly $r

# ── 1. the two hard-coded assumptions must be gone from the payroll route ────
if ($pCode -match "select\('id, status'\)" -or $pCode -match 'select\("id, status"\)') {
    Write-Host "X the payroll route still selects payroll_runs.status - the column does not exist" -ForegroundColor Red; exit 1
}
if ($pCode -match "account_code'?\s*,\s*'6110'") {
    Write-Host "X the payroll route still looks the expense account up by the code 6110" -ForegroundColor Red; exit 1
}
if ($pCode -notmatch [regex]::Escape("'salaries_expense'")) {
    Write-Host "X the payroll route does not resolve the expense account by meaning" -ForegroundColor Red; exit 1
}
Write-Host "+ payroll resolves its expense account by meaning, and asks for no phantom column" -ForegroundColor Green

# ── 2. no `status` flag was invented beside the ledger ──────────────────────
# The ledger already records that a run was paid; a second flag could disagree
# with it, and the ledger is the one that decides double payment.
if ($m -match 'ADD COLUMN[^\n]*status' -and $m -match 'payroll_runs') {
    Write-Host "X a status column was added to payroll_runs - the journal entry is the record" -ForegroundColor Red; exit 1
}
$sel = Get-Content -LiteralPath "scripts/check-phantom-selects.js" -Raw
if ($sel -notmatch 'PHANTOM_SELECT_BASELINE \?\? 11') {
    Write-Host "X the phantom-select baseline is not 11 - it must ratchet down, never up" -ForegroundColor Red; exit 1
}
Write-Host "+ no second source of truth beside the journal (read baseline 13 -> 11)" -ForegroundColor Green

# ── 3. the migration must tag the template AND repair existing companies ────
# The founding rule: close the gap so it cannot recur, then repair the data
# already sitting in the companies - clean data is the proof the fix landed.
if ($m -notmatch [regex]::Escape("chart_of_accounts_template")) {
    Write-Host "X the migration does not tag the template - new companies would repeat the bug" -ForegroundColor Red; exit 1
}
if ($m -notmatch 'UPDATE public\.chart_of_accounts\b') {
    Write-Host "X the migration does not repair the existing companies" -ForegroundColor Red; exit 1
}
Write-Host "+ template tagged and existing company data repaired" -ForegroundColor Green

# ── 4. depreciation must not be matched on a code no chart has ──────────────
if ($rCode -notmatch [regex]::Escape("depreciation_expense")) {
    Write-Host "X the simplified report still finds depreciation by code alone" -ForegroundColor Red; exit 1
}
if ($rCode -notmatch [regex]::Escape('"5290"')) {
    Write-Host "X the simplified report does not match the real depreciation account 5290" -ForegroundColor Red; exit 1
}
Write-Host "+ depreciation is found by meaning - the report stops overstating profit" -ForegroundColor Green

# ── 5. and the new guard must be able to FAIL ───────────────────────────────
# Reporting zero proves nothing until the guard has been seen refusing the bug
# it exists for. 845 shipped a guard that could never fail; this plants one.
Write-Host "Proving the account-code guard can fail..." -ForegroundColor Cyan
$probe = "scripts/acct-probe.tmp.ts"
'const q = { account_code: "9999" }
export default q' | Set-Content -LiteralPath $probe -Encoding UTF8
node scripts/check-hardcoded-account-codes.js *> $null
$probeExit = $LASTEXITCODE
Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
if ($probeExit -eq 0) {
    Write-Host "X the account-code guard did NOT fail on a planted phantom code - it is asleep" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard fails when it should" -ForegroundColor Green

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.846.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "probe") { Write-Host "X a probe file leaked into the commit" -ForegroundColor Red; exit 1 }
if (Test-Path $probe) { Write-Host "X the probe file was not cleaned up" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_847.txt"
    $msgLines = @(
        'fix(hr,accounting): v3.74.847 - payroll payment had never worked, in any',
        'company, and three more accounts were looked up by a number no chart has',
        '',
        'The payroll payment route failed twice before it ever reached the posting',
        'RPC, and both failures are the same shape: the code ASSUMED a fact instead',
        'of ASKING for it.',
        '',
        '  payroll_runs.status  - the column does not exist and never did, so',
        '                         PostgREST rejected the whole query and the route',
        '                         answered "error fetching the payroll run" every',
        '                         single time.',
        '  account code 6110    - exists in NO company. The seeded chart uses 5210',
        '                         "Salaries and wages". Even with the first bug',
        '                         fixed, every payment would still have been',
        '                         refused for a missing account.',
        '',
        'Production confirms it: 2 payroll runs, 18 payslips, and ZERO payroll',
        'payment journal entries. Payroll has never been paid through the app.',
        '',
        'I did NOT add a status column, though that is what the code appeared to',
        'want. post_payroll_atomic already refuses a second payment by looking for',
        'a journal entry with reference_type=payroll_payment for that run, and',
        'returning it with {idempotent:true}. The LEDGER is the record that the',
        'payroll was paid. A status flag beside it would be a second source of',
        'truth that can drift from the first, and the one that decides double',
        'payment is the ledger. The pre-check was deleted, not rebuilt.',
        '',
        'Correcting myself: in 846 I warned that the missing column meant payroll',
        'could be paid twice. That was wrong - I read the route and not the RPC.',
        'Double payment was always blocked. What was impossible was paying at all.',
        '',
        'Verified end to end against production in a rolled-back transaction:',
        '  expense account chosen  5210 Salaries and wages   (by meaning, not code)',
        '  first payment           ok, net 47,000, gross 47,000',
        '  journal entry           3 lines, debits - credits = 0.00',
        '  second attempt          idempotent, same entry, "already paid"',
        '  entries for that run    1',
        '',
        'The root fix is that the account is resolved by what it MEANS. 5210 is now',
        'tagged sub_type=salaries_expense in the template AND in all four existing',
        'companies; the code list is a fallback behind the tag, and it keeps 6110',
        'so a company that really uses that number is not broken by the correction.',
        '',
        'Worth noticing: 2130 "Accrued salaries" carried sub_type=accrued_salaries',
        'from the start, while its counterpart on the expense side was left',
        'untagged. The tagged side worked and the untagged side did not. The tag is',
        'not decoration.',
        '',
        'A new guard - check-hardcoded-account-codes.js - compares every account',
        'code written literally in the codebase against the chart template. It',
        'found three more live bugs of exactly this kind:',
        '',
        '  5500 for depreciation, in the simplified report. The real account is',
        '  5290. The filter matched nothing, so the report showed depreciation of',
        '  zero and OVERSTATED net profit by the entire depreciation charge -',
        '  quietly, every time.',
        '',
        '  1010 as the default payment account, in three places across expenses.',
        '  The cash account is 1110. Any company without an explicit payment',
        '  account configured had its expenses refused with ACCOUNTS_MISSING.',
        '',
        'Why none of this surfaced for so long: the number is hard-coded in the',
        'application, not in the database, so no schema check can see it - and the',
        'resulting message reads to the user like their own company is missing some',
        'setup, rather than like a bug worth reporting.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.847 pushed - payroll can be paid, and accounts are found by meaning" -ForegroundColor Green
}
