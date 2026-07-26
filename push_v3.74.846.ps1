$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.845.ps1") { Remove-Item -LiteralPath "push_v3.74.845.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.846"') {
    Write-Host "+ 3.74.846" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.846]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.846]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ── stage FIRST, then check (842/844) ───────────────────────────────────────
$files = @(
  "lib/version.ts", "CHANGELOG.md",
  "scripts/check-phantom-selects.js", "scripts/check-phantom-columns.js",
  "app/vendor-credits/[id]/page.tsx",
  "components/AdvancedPermissionsManager.tsx", "components/EnhancedReportLayout.tsx",
  "lib/branch-access-control.ts",
  "components/fixed-assets/add-capital-dialog.tsx", "components/fixed-assets/dispose-asset-dialog.tsx",
  "scripts/verify-equity-audit.ts", "lib/accrual-accounting-engine.ts",
  "app/api/customers/delete/route.ts", "components/customers/customer-form-dialog.tsx",
  "lib/services/bonus-calculator.service.ts", "lib/services/supplier-payment-command.service.ts",
  "app/api/commissions/attach-to-payroll/route.ts",
  "app/api/commissions/instant-payouts/pay/route.ts",
  "app/api/commissions/instant-payouts/route.ts",
  "tests/critical/financial-integrity.test.ts", "lib/data-validation.ts",
  "app/api/diagnose-invoice/route.ts", "app/api/fix-inventory/route.ts",
  "scripts/delete_sales.ts", "scripts/patch-pr-confirmed-by.ts",
  "app/api/permissions/shared-with-me/route.ts", "lib/customer-balance.ts",
  "docs/HANDOVER_2026-07-24.md", "push_v3.74.846.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.845.ps1" 2>$null

# ── 1. the ratchet must have moved DOWN, and never be loosened ──────────────
# The point of this release is that debt was PAID, not re-baselined. If either
# baseline went up, someone widened the allowance instead of fixing the code.
$sel = Get-Content -LiteralPath "scripts/check-phantom-selects.js" -Raw
$col = Get-Content -LiteralPath "scripts/check-phantom-columns.js" -Raw
if ($sel -notmatch 'PHANTOM_SELECT_BASELINE \?\? 13') {
    Write-Host "X the phantom-select baseline is not 13 - it must ratchet down, never up" -ForegroundColor Red; exit 1
}
if ($col -notmatch 'const BASELINE = 55') {
    Write-Host "X the phantom-write baseline is not 55" -ForegroundColor Red; exit 1
}
Write-Host "+ both baselines ratcheted down (44->13 reads, 56->55 writes)" -ForegroundColor Green

# ── 2. the specific fixes must be present, by real column name ──────────────
# Each pair is (file, the phantom that must be GONE, the real column that must
# be THERE). Checking only for the new name would pass on a file that still has
# the old one somewhere else.
#
# The ghost pattern must be anchored to its TABLE. My first version simply
# banned "'id, name, code'" in branch-access-control.ts - and that file reads
# exactly that from `branches` and from `warehouses`, which really do have
# `name` and `code`. The check would have failed on correct code and pushed me
# to break two working reads. Same shape as 844's nine false positives: a guard
# that flags correct code argues for breaking what works.
$pairs = @(
  @("lib/branch-access-control.ts",                     "",                                  "name:cost_center_name"),
  @("components/AdvancedPermissionsManager.tsx",        "",                                  "name:cost_center_name"),
  @("components/EnhancedReportLayout.tsx",              "",                                  "name:cost_center_name"),
  @("app/vendor-credits/[id]/page.tsx",                 "",                                  "name:cost_center_name"),
  @("components/fixed-assets/add-capital-dialog.tsx",   "account_name, code,",               "code:account_code"),
  @("components/fixed-assets/dispose-asset-dialog.tsx", "account_name, code,",               "code:account_code"),
  @("scripts/verify-equity-audit.ts",                   "account_name, code,",               "code:account_code"),
  @("lib/accrual-accounting-engine.ts",                 "",                                  "reference:reference_number"),
  @("app/api/customers/delete/route.ts",                "id, order_number,",                 "order_number:so_number"),
  @("components/customers/customer-form-dialog.tsx",    "username, full_name`"",             "full_name:display_name"),
  @("lib/services/supplier-payment-command.service.ts", "",                                  "original_amount:original_total"),
  @("app/api/commissions/attach-to-payroll/route.ts",   "employee_id, commission_amount'",   "commission_amount:amount")
)
foreach ($p in $pairs) {
    $txt = Get-Content -LiteralPath $p[0] -Raw
    if ($p[1] -ne "" -and $txt -match [regex]::Escape($p[1])) {
        Write-Host ("X " + $p[0] + " still reads the phantom column: " + $p[1]) -ForegroundColor Red; exit 1
    }
    if ($txt -notmatch [regex]::Escape($p[2])) {
        Write-Host ("X " + $p[0] + " is missing the corrected read: " + $p[2]) -ForegroundColor Red; exit 1
    }
}
Write-Host "+ every renamed read points at a column that exists" -ForegroundColor Green

# ── 3. the customer credit: read AND write were both wrong ──────────────────
# This one is not a rename. The row was never written at all, so the fix has to
# be checked on both sides or half of it could ship.
$cb = Get-Content -LiteralPath "lib/customer-balance.ts" -Raw
# COMMENTS STRIPPED FIRST. The comment explaining the fix necessarily contains
# the word `remaining_amount`, so a naive search finds it and declares the fix
# missing. This is the same trap the project has hit eight times before:
# an anchor must be a line of CODE, never the mere presence or absence of text.
$cbCode = (($cb -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*)' }) -join "`n"
foreach ($ghost in @("remaining_amount", "invoice_id:", "reason:")) {
    if ($cbCode -match [regex]::Escape($ghost)) {
        Write-Host "X lib/customer-balance.ts still uses a phantom field: $ghost" -ForegroundColor Red; exit 1
    }
}
foreach ($real in @("reference_type:", "reference_id:", "notes:", "used_amount", "applied_amount")) {
    if ($cb -notmatch [regex]::Escape($real)) {
        Write-Host "X lib/customer-balance.ts is missing the real field: $real" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the customer credit is written with columns the table actually has" -ForegroundColor Green

# ── 4. and the guard must still be able to FAIL ─────────────────────────────
# A ratchet that can only be lowered is worthless if the check underneath it is
# asleep. Same probe as 845, and the same reason: no leading dot, or the guard
# skips the file and the self-test proves nothing.
Write-Host "Proving the phantom-select guard can still fail..." -ForegroundColor Cyan
$probe = "scripts/phantom-probe.tmp.ts"
@'
import { createClient } from "@supabase/supabase-js"
const s = createClient("x", "y")
export const q = () => s.from("employees").select("id, definitely_not_a_real_column")
'@ | Set-Content -LiteralPath $probe -Encoding UTF8
node scripts/check-phantom-selects.js *> $null
$probeExit = $LASTEXITCODE
Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
if ($probeExit -eq 0) {
    Write-Host "X the guard did NOT fail on a planted phantom column - it is asleep" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard fails when it should" -ForegroundColor Green

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
git add -u -- "push_v3.74.845.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "phantom-probe") { Write-Host "X the probe file leaked into the commit" -ForegroundColor Red; exit 1 }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_846.txt"
    $msgLines = @(
        'fix: v3.74.846 - repair 31 reads of columns that do not exist',
        '',
        'The guard added in 845 found 44 literal .select() calls asking for a column',
        'the table does not have. All 32 distinct table.column pairs were checked',
        'against the production database: every one is genuinely absent. Not a stale',
        'schema snapshot - real broken reads running today.',
        '',
        '31 are fixed here, and one phantom WRITE fell with them (56 -> 55).',
        '',
        'What was actually broken:',
        '',
        '  cost centres (4 sites)   name/code            -> cost_center_name/_code',
        '    Every cost-centre dropdown came back empty: permissions, reports,',
        '    vendor credits.',
        '  chart of accounts (3)    code                 -> account_code',
        '  payment journal          reference            -> reference_number',
        '    This one threw: "Payment not found" on every posting attempt.',
        '  customer credit          remaining_amount     -> amount / used_amount',
        '                           invoice_id           -> reference_type/reference_id',
        '                           reason               -> notes',
        '    Read AND insert were both wrong, so a net customer credit was never',
        '    recorded at all. The corrected insert was executed against production',
        '    in a rolled-back transaction to prove the row is accepted.',
        '  customer delete          order_number         -> so_number',
        '  commissions (3 sites)    commission_amount    -> amount',
        '  supplier payment         original_amount      -> original_total',
        '  duplicate customer       full_name            -> display_name',
        '  bonus                    currency             -> currency_code',
        '  shared-with-me           user_profiles.email  -> auth.users',
        '    Asking for a column that is not there made the whole profile read',
        '    fail, so EVERY grantor fell through to the auth lookup and the',
        '    profile display name was never used. Invisible, because the fallback',
        '    quietly produced a usable answer.',
        '',
        'Most are fixed by aliasing - name:cost_center_name - so no consuming code',
        'changes and no behaviour changes. A read that used to fail now succeeds.',
        '',
        'THIRTEEN REMAIN, and they are not renames. The code is written and the',
        'columns were never created:',
        '',
        '  payroll_runs.status',
        '    The pay route reads it, so it errors every time. Worse: nothing in the',
        '    schema records that a payroll run was paid, so there is no state to',
        '    stop it being paid twice - the same double-payment shape 845 just',
        '    closed for production labour.',
        '  companies.max_users / monthly_cost / subscription_plan',
        '    The subscription screen answers "company not found".',
        '  commission_runs.payroll_run_id, commission_plans.payout_mode,',
        '  commission_ledger.payment_status / paid_at / payment_journal_entry_id',
        '    Commission-to-payroll attachment cannot work.',
        '  chart_of_accounts.balance / currency_code',
        '    FX revaluation returns "success, zero gain, zero loss" without',
        '    revaluing anything.',
        '',
        'Those four need a product decision - create the columns or drop the',
        'feature - not a rename, so they stay on the baseline rather than being',
        'guessed at. The baseline ratchets down, never up: it is 13 now, and the',
        'push script fails if either baseline is raised.',
        '',
        'The lesson is the one 845 recorded and this release measures: code that',
        'reads a column which is not there does not raise anything a user sees. It',
        'returns empty, and the feature looks like it works but has no data. That',
        'was true in thirteen places we still know about, and was true in',
        'thirty-one more until today.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.846 pushed - 31 silent failures fewer" -ForegroundColor Green
}
