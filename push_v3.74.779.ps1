$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.777.ps1") { Remove-Item -LiteralPath "push_v3.74.777.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.779"') {
    Write-Host "+ 3.74.779" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

# Mirror the hook exactly: it greps for "[<version>]" literally.
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.779]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.779]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- THE invariant of this release -------------------------------------------
# The whole point of stage 3 is that the browser no longer writes to the ledger
# for expenses. If any of these reappear in app/expenses, the release has been
# undone regardless of what else passes.
$ledgerInBrowser = Get-ChildItem -Path "app/expenses" -Recurse -Include *.tsx,*.ts |
    Select-String -Pattern "createExpenseJournalEntry|checkDuplicateJournalEntry|journal_entry_id:\s*"
if ($ledgerInBrowser) {
    Write-Host "X the browser is writing to the ledger again:" -ForegroundColor Red
    $ledgerInBrowser | ForEach-Object { Write-Host "   $_" }
    exit 1
}
Write-Host "+ no browser-side ledger writes remain in app/expenses" -ForegroundColor Green

# --- the three server routes ---------------------------------------------------
# -LiteralPath throughout: these paths contain [id], and PowerShell reads square
# brackets as a wildcard character class. Without it Test-Path reports files
# missing that git, node and npx all find perfectly well.
$routes = @(
    "app/api/expenses/[id]/approve/route.ts",
    "app/api/expenses/[id]/reject/route.ts",
    "app/api/expenses/[id]/post/route.ts"
)
foreach ($r in $routes) {
    if (-not (Test-Path -LiteralPath $r)) { Write-Host "X missing route: $r" -ForegroundColor Red; exit 1 }
    $src = Get-Content -LiteralPath $r -Raw
    if ($src -notmatch "auth\.getUser\(\)") {
        Write-Host "X $r does not authenticate" -ForegroundColor Red; exit 1
    }
    if ($src -notmatch "getActiveCompanyId") {
        Write-Host "X $r is not company-scoped" -ForegroundColor Red; exit 1
    }
    # Authorisation must be the database's answer, not the route's opinion.
    if ($src -notmatch "_expense_atomic") {
        Write-Host "X $r does not go through the atomic function" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all three routes authenticate, scope by company, and post atomically" -ForegroundColor Green

# --- the migration must match what was rehearsed -------------------------------
# The rehearsal ran against a function WITH p_payment_reference and WITH the
# drop of the older 5-argument version. A migration file missing either would
# install something other than what was tested.
$mig = "supabase/migrations/20260721000004_v3_74_778_post_expense_atomic.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X missing $mig" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "DROP FUNCTION IF EXISTS public\.post_expense_atomic\(uuid, uuid, uuid, uuid, uuid\)") {
    Write-Host "X the migration would leave a 5-arg overload behind" -ForegroundColor Red; exit 1
}
if ($m -notmatch "p_payment_reference") {
    Write-Host "X the migration predates the rehearsed signature" -ForegroundColor Red; exit 1
}
# create_journal_entry_atomic RETURNS its failures rather than raising them.
# A version of this function that does not inspect that result would link an
# expense to an entry that was never written.
if ($m -notmatch "existing_id") {
    Write-Host "X the migration does not handle DUPLICATE_JE" -ForegroundColor Red; exit 1
}
if ($m -notmatch "EXPENSE_LINK_FAILED") {
    Write-Host "X the migration does not verify that the link actually landed" -ForegroundColor Red; exit 1
}
Write-Host "+ migration matches the rehearsed function" -ForegroundColor Green

$mig2 = "supabase/migrations/20260721000005_v3_74_779_approve_reject_expense_atomic.sql"
if (-not (Test-Path -LiteralPath $mig2)) { Write-Host "X missing $mig2" -ForegroundColor Red; exit 1 }
$m2 = Get-Content -LiteralPath $mig2 -Raw
# The actor must come from the session, or an end user can approve as someone else.
if ($m2 -notmatch "COALESCE\(auth\.uid\(\), p_actor_id\)") {
    Write-Host "X the approver identity is not taken from the session" -ForegroundColor Red; exit 1
}
if ($m2 -notmatch "BEFORE INSERT OR UPDATE ON public\.expenses") {
    Write-Host "X the paid-without-journal guard is not widened to INSERT" -ForegroundColor Red; exit 1
}
Write-Host "+ actor comes from the session; paid-without-journal guard covers INSERT" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }
Write-Host "! This checker only sees SINGLE-LINE writes. A multi-line-aware count" -ForegroundColor Yellow
Write-Host "! run during this release found 281 total, i.e. 136 it cannot see." -ForegroundColor Yellow
Write-Host "! Fixing the checker is the next job, not this one." -ForegroundColor Yellow

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
    "supabase/migrations/20260721000004_v3_74_778_post_expense_atomic.sql" `
    "supabase/migrations/20260721000005_v3_74_779_approve_reject_expense_atomic.sql" `
    "app/api/expenses/[id]/approve/route.ts" `
    "app/api/expenses/[id]/reject/route.ts" `
    "app/api/expenses/[id]/post/route.ts" `
    "app/expenses/[id]/page.tsx" `
    "app/expenses/new/page.tsx" `
    "push_v3.74.779.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.777.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_779.txt"
    $msgLines = @(
        'feat(expenses): v3.74.779 - expenses move to the server; posting is atomic',
        '',
        'The expenses module had no server route at all. Every write happened in the',
        'browser, across three separate paths that wrote to the ledger directly.',
        '',
        'The journal entry itself was never the problem - it was written by one',
        'atomic RPC. The problem was the call AFTER it: a second, separate update',
        'that linked the expense to its entry and marked it paid, with no error',
        'check anywhere. A dropped connection there left a posted entry against an',
        'expense that still looked unpaid, and the user saw "approved successfully".',
        'That direction had no integrity check in the system; the reverse case has',
        'ic_expense_no_journal, this one had nothing.',
        '',
        'The sole-senior auto-approve path was worse: three unchecked updates,',
        'including the revert itself, so a failed revert reported nothing at all.',
        '',
        'Approval, the cash-balance rule, the journal entry and the link are now one',
        'transaction. Nothing needs reverting because a half-approval cannot exist.',
        '',
        'Two things worth recording:',
        '',
        '  create_journal_entry_atomic does not raise its failures, it RETURNS them',
        '  - its body ends in EXCEPTION WHEN OTHERS THEN RETURN success:false. A',
        '  caller that only checks "it came back" would link an expense to an entry',
        '  that was never written. Same shape as an unchecked supabase-js write,',
        '  one layer down. post_expense_atomic inspects the result and raises.',
        '',
        '  Before building protection against editing or deleting a posted expense,',
        '  a check found it already exists and works - trg_block_expense_delete and',
        '  trg_block_expense_immutable_edits. A second copy of a working guard was',
        '  nearly built. The check did find one real hole:',
        '  trg_expense_paid_requires_journal was BEFORE UPDATE only, so a row could',
        '  be INSERTED as paid with no journal. Widened, and ordinary expense',
        '  creation verified still working.',
        '',
        'Approval is now owner/general_manager only - narrower than before, which',
        'also allowed admin. Verified against production first: zero admin members',
        'in any of the four companies, every company keeps an approver. manager is',
        'excluded, resolving a three-way contradiction where managers were emailed',
        '"an expense needs your approval" and then refused by both the button and',
        'RLS. Separation of duties is unchanged and still enforced by the existing',
        'trigger.',
        '',
        'The actor is auth.uid() whenever a session exists; p_actor_id is honoured',
        'only when it is null. Without that, a logged-in user calling the RPC',
        'directly could record an approval under another persons name.',
        '',
        'Rehearsed on a restored copy of production, then verified on production',
        'itself inside a transaction that rolls back. Twelve cases including',
        'deliberately failing the link step: no orphaned entry survived. Production',
        'totals before and after are identical to the piaster.',
        '',
        'Notifications deliberately stay in the browser. Moving them would mean',
        'porting notification plumbing in the release that moves the accounting.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.779 pushed - expenses are server-side" -ForegroundColor Green
}
