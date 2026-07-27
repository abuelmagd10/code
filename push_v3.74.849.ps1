$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.848.ps1") { Remove-Item -LiteralPath "push_v3.74.848.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.849"') {
    Write-Host "+ 3.74.849" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.849]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.849]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260727000001_v3_74_849_commission_payroll_link.sql"
$route = "app/api/commissions/attach-to-payroll/route.ts"
$test  = "scripts/test-commission-payroll-integration.ts"

# Deleted files must be staged too, or the commit keeps them alive.
$files = @("lib/version.ts", "CHANGELOG.md", $mig, $route, $test,
           "scripts/check-phantom-selects.js",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.849.ps1")
git add -- $files 2>&1 | Out-Null
git add -A -- "app/api/subscription" "lib/subscription.ts" 2>$null
git add -u -- "push_v3.74.848.ps1" 2>$null

$m = Get-Content -LiteralPath $mig   -Raw
$r = Get-Content -LiteralPath $route -Raw
$t = Get-Content -LiteralPath $test  -Raw

function CodeOnly($text) {
    (($text -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*|--)' }) -join "`n"
}
$rCode = CodeOnly $r
$tCode = CodeOnly $t

# ── 1. the link column, and the guard that makes it a guard ────────────────
# The column is not a detail: without it, pressing "attach commissions" twice
# adds the commission to the payslips twice.
if ($m -notmatch [regex]::Escape("ADD COLUMN IF NOT EXISTS payroll_run_id")) {
    Write-Host "X the migration does not add commission_runs.payroll_run_id" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("CREATE TRIGGER trg_cmr_payroll_link_write_once")) {
    Write-Host "X nothing stops the link being re-pointed at another payroll run" -ForegroundColor Red; exit 1
}
Write-Host "+ the link exists and is write-once" -ForegroundColor Green

# ── 2. claim the link BEFORE touching payslips ─────────────────────────────
# The old order - update every payslip, then record the link - leaves the raise
# applied with nothing to prevent a repeat if anything fails in between.
$claimAt  = $m.IndexOf("UPDATE public.commission_runs SET payroll_run_id")
$applyAt  = $m.IndexOf("UPDATE public.payslips")
if ($claimAt -lt 0 -or $applyAt -lt 0 -or $claimAt -gt $applyAt) {
    Write-Host "X payslips are modified before the link is claimed - a failure in between doubles the commission" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("FOR UPDATE")) {
    Write-Host "X the commission run is not locked - two concurrent attaches could both proceed" -ForegroundColor Red; exit 1
}
Write-Host "+ link claimed before any payslip changes, under a row lock" -ForegroundColor Green

# ── 3. the net-salary formula must match what post_payroll_atomic reads ────
# It omitted commission and commission_advance_deducted, so the payslip it
# wrote would not balance and the payroll posting would refuse the lot.
foreach ($f in @("ps.commission,0", "ps.commission_advance_deducted,0")) {
    if ($m -notmatch [regex]::Escape($f)) {
        Write-Host "X the net-salary formula omits $f - the payslip will not balance" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ net salary uses the same formula the payroll posting checks" -ForegroundColor Green

# ── 4. the route must go through the atomic RPC, not do it piecemeal ───────
if ($rCode -notmatch [regex]::Escape("commission_attach_to_payroll_atomic")) {
    Write-Host "X the route does not call the atomic RPC" -ForegroundColor Red; exit 1
}
foreach ($ghost in @("payout_mode", "payroll_run_id, commission_plans")) {
    if ($rCode -match [regex]::Escape($ghost)) {
        Write-Host "X the route still reads a phantom column: $ghost" -ForegroundColor Red; exit 1
    }
}
if ($rCode -notmatch [regex]::Escape("ALREADY_ATTACHED")) {
    Write-Host "X the route does not translate the double-attach refusal for the user" -ForegroundColor Red; exit 1
}
Write-Host "+ one atomic call, no phantom reads, refusals explained in Arabic" -ForegroundColor Green

# ── 5. the dead duplicates must actually be gone ───────────────────────────
# Verified before deleting: nothing imports lib/subscription.ts, nothing fetches
# /api/subscription/*, there is no screen, and a correct billing system exists.
# subscription/create additionally had NO auth at all while creating users.
foreach ($gone in @("app/api/subscription/users/route.ts",
                    "app/api/subscription/create/route.ts",
                    "lib/subscription.ts")) {
    if (Test-Path $gone) {
        Write-Host "X $gone is still present" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the dead subscription duplicates are gone, including the unauthenticated one" -ForegroundColor Green

# ── 6. the test script must be able to fail ────────────────────────────────
# Its old logic printed "exists" only on an error, and threw only when the
# message did NOT say "does not exist" - which is what such a message says. It
# passed either way, while pointed at the wrong table.
if ($tCode -match "payment_journal_entry_id") {
    Write-Host "X the test still checks commission_ledger for columns that live on commission_runs" -ForegroundColor Red; exit 1
}
if ($tCode -notmatch [regex]::Escape("mustHave")) {
    Write-Host "X the test still cannot fail" -ForegroundColor Red; exit 1
}
Write-Host "+ the schema test now fails when the schema is wrong" -ForegroundColor Green

# ── 7. the ratchet reaches zero ────────────────────────────────────────────
$sel = Get-Content -LiteralPath "scripts/check-phantom-selects.js" -Raw
if ($sel -notmatch 'PHANTOM_SELECT_BASELINE \?\? 0') {
    Write-Host "X the phantom-select baseline is not 0" -ForegroundColor Red; exit 1
}
Write-Host "+ phantom read baseline 44 -> 0" -ForegroundColor Green

# ── 8. and both guards must still be able to FAIL ──────────────────────────
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
git add -A -- "app/api/subscription" "lib/subscription.ts" 2>$null
git add -u -- "push_v3.74.848.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "probe")  { Write-Host "X a probe file leaked into the commit" -ForegroundColor Red; exit 1 }
if ((Test-Path $probe1) -or (Test-Path $probe2)) { Write-Host "X a probe file was not cleaned up" -ForegroundColor Red; exit 1 }

# The deletions must be IN the commit, not merely on disk.
foreach ($gone in @("app/api/subscription/users/route.ts",
                    "app/api/subscription/create/route.ts",
                    "lib/subscription.ts")) {
    if ($staged -notcontains $gone) {
        Write-Host "X the deletion of $gone is not staged - it would stay in the repo" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the three deletions are part of the commit" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_849.txt"
    $msgLines = @(
        'fix(hr,security): v3.74.849 - phantom column reads 44 -> 0, and the',
        'commission-to-payroll link that stops a commission being paid twice',
        '',
        'I nearly deleted a working feature, and the owner stopped me.',
        '',
        'I had recommended removing the commission code on the grounds that all',
        'three commission tables were empty. He asked me to verify that the code',
        'was not used anywhere first. It is: 26 files, 12 API routes, screens for',
        'plans, runs and instant payouts, and a live button on the payroll screen',
        'that calls the very route I proposed to delete. The tables are empty',
        'because the feature has not been USED yet, not because it does not exist.',
        '',
        'An empty table says nothing about whether code is dead. Before deleting:',
        'who imports it, who calls it, and does it have a screen or a button -',
        'all three, not one.',
        '',
        'The actual defect was one missing column, commission_runs.payroll_run_id.',
        'Not a detail: it is the guard. Without it, pressing "attach commissions"',
        'twice adds the commission to the payslips twice.',
        '',
        'Three further defects in the same path:',
        '',
        '  - commission_plans(payout_mode) was selected and never used, and does',
        '    not exist either.',
        '  - The net-salary formula omitted commission and',
        '    commission_advance_deducted, so the payslip it wrote would not',
        '    balance and post_payroll_atomic would refuse the whole payroll with',
        '    PAYSLIP_IMBALANCE.',
        '  - The order was: update every payslip, THEN record the link. Anything',
        '    failing in between leaves the raise applied with nothing to prevent',
        '    a repeat. The work now happens in one transaction that locks the',
        '    run, CLAIMS the link, and only then touches payslips; a trigger',
        '    refuses to re-point the link at a different payroll run.',
        '',
        'Verified on production in a rolled-back transaction:',
        '  before                 net 7,000, sales bonus 0.00',
        '  first attach           1 employee, 500.00 -> net 7,500',
        '  payslip imbalance      0.00 (or the payroll posting would refuse it)',
        '  second attach          idempotent, net still 7,500 - no doubling',
        '  re-point to other run  refused',
        '',
        'The subscription side went the other way. app/api/subscription/users and',
        'lib/subscription.ts have zero importers, zero callers and no screen, and',
        'a correct billing system exists beside them - subscription_plans with',
        'included_seats, subscriptions, billing_invoices, /api/billing/*. They are',
        'abandoned first drafts, and leaving them invites someone to wire up the',
        'wrong one. Removed after checking all three questions above.',
        '',
        'While checking, app/api/subscription/create turned out to have NO',
        'authentication at all while creating auth users with the service-role',
        'key, and no caller. Removed as well.',
        '',
        'And the commission schema test could not fail: it printed "exists" only',
        'when there was an error, and threw only when the message did NOT say',
        '"does not exist" - which is exactly what that message says. It passed',
        'either way, while pointed at the wrong table for the payment columns.',
        '',
        'Phantom column reads are now 0, down from 44 over five releases, and the',
        'baseline cannot be raised. Each was treated on its own terms rather than',
        'with one blanket remedy: 31 were renames fixed by aliasing; two columns',
        'were deliberately NOT created because the truth is derived, not stored -',
        'an account balance, and whether a payroll run was paid; one column WAS',
        'created because it is a real double-payment guard; two dead duplicates',
        'were removed; and one test had its logic corrected.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.849 pushed - zero phantom reads, and commissions cannot be paid twice" -ForegroundColor Green
}
