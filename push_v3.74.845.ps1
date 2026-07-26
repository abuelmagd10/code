$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.844.ps1") { Remove-Item -LiteralPath "push_v3.74.844.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.845"') {
    Write-Host "+ 3.74.845" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.845]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.845]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig   = "supabase/migrations/20260726000012_v3_74_845_absorption_base_and_no_double_pay.sql"
$acct  = "lib/manufacturing/manufacturing-accounting.ts"
$wcPg  = "app/manufacturing/work-centers/page.tsx"
$plPg  = "app/hr/production-labour/page.tsx"
$guard = "scripts/check-phantom-selects.js"

# ── stage FIRST, then check (lesson from 842/844) ───────────────────────────
# The referenced-scripts guard and the migration/database guard both read git
# state; a brand-new untracked file is invisible to them. Staging at the end
# makes those checks depend on the order of operations rather than the content.
$files = @("lib/version.ts", "CHANGELOG.md", $mig, $acct, $wcPg, $plPg, $guard,
           "app/api/manufacturing/work-centers/route.ts",
           "app/api/manufacturing/work-centers/[id]/route.ts",
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.845.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.844.ps1" 2>$null

$m  = Get-Content -LiteralPath $mig   -Raw
$a  = Get-Content -LiteralPath $acct  -Raw
$wc = Get-Content -LiteralPath $wcPg  -Raw
$pl = Get-Content -LiteralPath $plPg  -Raw

# ── 1. the absorption base must be honoured where cost is actually computed ──
# The whole point of 845 is that the DB column and the TypeScript calculation
# agree. A migration that adds a column nobody reads changes nothing.
if ($a -notmatch [regex]::Escape("overhead_absorption_base")) {
    Write-Host "X calculateConversionCost does not read overhead_absorption_base" -ForegroundColor Red; exit 1
}
if ($a -notmatch [regex]::Escape("absorptionHours")) {
    Write-Host "X the absorption hours are not used in the overhead lines" -ForegroundColor Red; exit 1
}
# machine cost must NOT follow the absorption base - it pays for a machine.
if ($a -match 'opMachine\s*=\s*absorptionHours') {
    Write-Host "X machine cost was put on the absorption base; it belongs on machine hours" -ForegroundColor Red; exit 1
}
if ($a -notmatch 'opVarOh\s*=\s*absorptionHours' -or $a -notmatch 'opFixOh\s*=\s*absorptionHours') {
    Write-Host "X the overheads do not follow the absorption base" -ForegroundColor Red; exit 1
}
Write-Host "+ overheads follow the base; machine cost stays on machine hours" -ForegroundColor Green

# ── 2. the guard must run at SUBMISSION, not only at approval ────────────────
# 833's lesson, repeated: check at the gate whose owner can fix the problem.
if ($m -notmatch "pending_approval'\s*,\s*'approved") {
    Write-Host "X the costability guard still runs on approval only - the owner would see an error he cannot fix" -ForegroundColor Red; exit 1
}
Write-Host "+ costability is checked when the request is SENT" -ForegroundColor Green

# ── 3. the double-payment block, in the database not just the screen ─────────
if ($m -notmatch [regex]::Escape("plw_assert_no_cash_to_salaried_employee")) {
    Write-Host "X the salaried double-payment guard is missing from the migration" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("base_salary")) {
    Write-Host "X the guard does not key on the employee's own salary" -ForegroundColor Red; exit 1
}
# both triggers: the lines trigger alone misses "create hours_only, then switch to paid"
foreach ($trg in @("trg_plpl_no_cash_to_salaried", "trg_plp_no_cash_to_salaried")) {
    if ($m -notmatch [regex]::Escape("CREATE TRIGGER $trg")) {
        Write-Host "X trigger $trg is missing - the workaround path is open" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ double payment blocked on both paths, in the database" -ForegroundColor Green

# every function in this migration must be revoked from PUBLIC (844's lesson:
# CREATE FUNCTION grants EXECUTE to PUBLIC, and an explicit GRANT does not undo it)
foreach ($fn in @("mr_assert_routing_operations_costable", "plw_assert_no_cash_to_salaried_employee")) {
    if ($m -notmatch ("REVOKE ALL ON FUNCTION public\." + [regex]::Escape($fn))) {
        Write-Host "X $fn is not revoked from PUBLIC - it is open to anon" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both functions revoked from PUBLIC" -ForegroundColor Green

# ── 4. the user must be told, not merely blocked ─────────────────────────────
# The owner asked for this explicitly: "موافق مع رسائل توضحية للمستخدم لكى يفهم".
# A refusal with no explanation teaches nothing and looks like a fault.
if ($wc -notmatch [regex]::Escape("overhead_absorption_base")) {
    Write-Host "X the work-centre screen has no absorption-base field" -ForegroundColor Red; exit 1
}
if ($wc -notmatch [regex]::Escape("ساعات العمالة") -or $wc -notmatch [regex]::Escape("ساعات الآلة")) {
    Write-Host "X the absorption-base field has no explanation of either choice" -ForegroundColor Red; exit 1
}
if ($wc -notmatch [regex]::Escape("labour_staffing_model")) {
    Write-Host "X the work-centre screen has no staffing-model field" -ForegroundColor Red; exit 1
}
if ($pl -notmatch [regex]::Escape("blockedBySalaried")) {
    Write-Host "X the labour screen does not warn before the database refuses" -ForegroundColor Red; exit 1
}
if ($pl -notmatch [regex]::Escape("lockedSalaried")) {
    Write-Host "X the amount box is not locked for a salaried employee" -ForegroundColor Red; exit 1
}
Write-Host "+ the user is told why, on both screens" -ForegroundColor Green

# ── 5. the 844 silent bug must stay fixed ────────────────────────────────────
# employees has full_name, not name. The failed read returned an error and
# `data || []` turned it into an empty list, so the screen showed no employees
# and nobody saw a bug.
if ($pl -match 'from\("employees"\)\.select\("id, name"') {
    Write-Host "X the employees list is reading a column that does not exist" -ForegroundColor Red; exit 1
}
if ($pl -notmatch [regex]::Escape('select("id, full_name, base_salary")')) {
    Write-Host "X the employees read does not fetch full_name and base_salary" -ForegroundColor Red; exit 1
}
Write-Host "+ the employees list reads real columns" -ForegroundColor Green

# ── 6. and the new guard must be able to FAIL ────────────────────────────────
# A guard is not believed until it is seen refusing the very bug it was written
# for. The first version of check-phantom-selects.js started its search window
# at the .from(...) itself, so its "is there another .from before the select?"
# safety test saw that same .from and skipped EVERY query - a guard that always
# passed. It only showed up when the 844 bug was reintroduced on purpose and
# the guard stayed silent.
#
# And the self-test had the same disease on its first attempt: the probe file
# was named `.phantom-probe.ts`, and the guard skips dot-files - so the planted
# defect was never scanned, the guard "passed", and the self-test declared the
# guard healthy. A test of a test can be asleep too. No leading dot.
Write-Host "Proving the phantom-select guard can fail..." -ForegroundColor Cyan
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
    Write-Host "X the phantom-select guard did NOT fail on a planted phantom column - it is asleep" -ForegroundColor Red; exit 1
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
git add -u -- "push_v3.74.844.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_845.txt"
    $msgLines = @(
        'fix(manufacturing,hr): v3.74.845 - let each work centre say what drives its',
        'overhead, check costability when the request is SENT, and refuse to pay a',
        'salaried employee twice',
        '',
        'Three gaps from one family: the system ASSUMED a fact instead of ASKING for it.',
        '',
        '1. Overhead was absorbed on machine hours, unconditionally.',
        '',
        'Right for a machine or a production line. Wrong for a hand workshop, which',
        'has no machine: machine minutes are zero, so absorbed overhead is zero, and',
        'the finished product carries labour but no share of the factory rent, power',
        'or insurance - then gets priced off a cost that is too low. Each work centre',
        'now declares its own base, suggested from its type and overridable, with the',
        'effect of each choice spelled out on the screen.',
        '',
        'machine_cost_rate deliberately stays on machine hours in both cases: it pays',
        'for a machine, so no machine time means no machine cost. Only the variable',
        'and fixed overheads follow the declared base.',
        '',
        '2. The costability guard ran at approval only.',
        '',
        'So the manufacturing officer submitted an incomplete routing, and the owner',
        'received a request that was IMPOSSIBLE to approve - the error surfaced to the',
        'one person who could not fix it. It now runs on submission as well.',
        '',
        'This is 833 word for word: check at the gate whose owner can fix the problem,',
        'not at the gate where the defect happens to become visible.',
        '',
        '3. Nothing stopped paying cash to an employee who already draws a salary.',
        '',
        'chk_plp_casual_is_always_paid blocked "casual worker with no payment". Its',
        'mirror image was wide open: a salaried employee plus a cash payment on a',
        'production order means he is paid twice and the cost is charged twice.',
        '',
        'The fact that decides this is whether the PERSON draws a salary, not the work',
        'centre - one workshop can hold a salaried employee and a day labourer at the',
        'same time - and that fact already exists as employees.base_salary. No new',
        'field for the user to enter, and none to forget.',
        '',
        'Verified on production in a rolled-back transaction, all five cases:',
        '  salaried + cash            REFUSED',
        '  salaried + hours only      allowed',
        '  casual + cash              allowed',
        '  employee with no salary    allowed  (the guard does not over-reach)',
        '  hours_only then switched to paid   REFUSED  (the workaround is covered)',
        '',
        'No offending record exists in the live company: this is preventive, not',
        'remedial. The block lives in the database; the screen locks the amount box',
        'and explains why, so nobody types a number and is then refused.',
        '',
        '4. And a silent bug shipped in 844: the employees list was always empty.',
        '',
        'The screen read employees.name - a column that does not exist; it is',
        'full_name. Anyone choosing "Employees" saw an empty list WITH NO ERROR,',
        'because the failed read returns an error and `data || []` turns that into an',
        'empty array. Nothing caught it: check-phantom-columns (830) inspects writes,',
        'and only in API routes. This was a read, in a page.',
        '',
        'A failed read is indistinguishable, by eye, from data that is not there.',
        'So check-phantom-selects.js now compares every literal .select() in the repo',
        'against the schema snapshot. It found 44 more, and a sample of twelve was',
        'checked against production: every one of them is genuinely missing. Those',
        'are real broken reads running today - cost centres, chart of accounts,',
        'payroll, invoices - each one a list that shows empty or a value that never',
        'appears. Baseline 44, so no new one can be added while they are worked off.',
        '',
        'The guard itself was wrong first, and worth recording. Its search window',
        'started AT the .from(...), so its own safety test - "is there another .from',
        'before this select?" - saw that very .from and skipped every query. It',
        'passed cleanly on a repo with 45 defects in it. That only came out because',
        'the 844 bug was reintroduced on purpose to watch the guard fire, and it did',
        'not. A guard reporting zero has proved nothing until it has been seen',
        'refusing the bug it was written for; the push script now plants a phantom',
        'column and fails the release if the guard stays quiet.',
        '',
        '5. Work centres also record who works there - casual, salaried, or both.',
        'Documentary, blocking nothing: it says what "labour cost rate" means, and',
        'tells the coming variance report where the actual cost comes from - cash',
        'paid to casual workers (account 5211) or a share of the monthly payroll.',
        '',
        'Still open: ROUT-001 v1 is active with zero labour and zero machine minutes',
        'on WC-01, so any production order using it yields zero conversion cost. The',
        'guard fires on submission and approval, so it does not touch versions',
        'approved earlier. WC-01 needs its rates set and a new routing version.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.845 pushed - overhead follows the work, and nobody is paid twice" -ForegroundColor Green
}
