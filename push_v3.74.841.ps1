$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.840.ps1") { Remove-Item -LiteralPath "push_v3.74.840.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.841"') {
    Write-Host "+ 3.74.841" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.841]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.841]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260726000009_v3_74_841_production_labour_wages.sql"

# ── the functions are pulled FROM THE LIVE DATABASE, never hand-copied ───────
# 834's lesson: a migration is a record of what was applied, not a transcript.
$fns = @(
  "mwc_guard_work_centre_cost_centre",
  "mr_assert_routing_operations_costable",
  "plw_caller_role",
  "plw_next_payment_no",
  "plw_create_labour_payment",
  "plw_submit_labour_payment",
  "plw_approve_labour_payment",
  "plw_reject_labour_payment",
  "plw_pay_labour_payment"
)
Write-Host "Appending function definitions straight from the database..." -ForegroundColor Cyan
foreach ($fn in $fns) {
    node scripts/append-function-to-migration.js $mig $fn
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X could not append $fn" -ForegroundColor Red; exit 1
    }
}

# The trigger goes LAST: it executes a function that must already be defined.
# Idempotent, so re-running the script does not stack duplicates.
$trigger = @"

DROP TRIGGER IF EXISTS trg_work_centre_cost_centre_required ON public.manufacturing_work_centers;
CREATE TRIGGER trg_work_centre_cost_centre_required
BEFORE INSERT OR UPDATE ON public.manufacturing_work_centers
FOR EACH ROW EXECUTE FUNCTION public.mwc_guard_work_centre_cost_centre();
"@
$current = Get-Content -LiteralPath $mig -Raw
if ($current -notmatch [regex]::Escape("CREATE TRIGGER trg_work_centre_cost_centre_required")) {
    Add-Content -LiteralPath $mig -Value $trigger -NoNewline
    Write-Host "+ trigger appended after its function" -ForegroundColor Green
}

$m = Get-Content -LiteralPath $mig -Raw

# Every function must be DEFINED in the file, not merely mentioned.
# `CREATE TRIGGER ... EXECUTE FUNCTION public.x()` mentions it; only
# `CREATE [OR REPLACE] FUNCTION public.x(` defines it. Checking for a mention is
# how the appender was fooled into skipping mwc_guard_work_centre_cost_centre.
foreach ($fn in $fns) {
    if ($m -notmatch "CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.$fn\s*\(") {
        Write-Host "X $fn is referenced but never DEFINED in the migration" -ForegroundColor Red
        Write-Host "  Applying this file to a fresh database would fail." -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ all $($fns.Count) functions are defined, not just referenced" -ForegroundColor Green

# and the trigger must come AFTER the function it points at
$posFnDef  = [regex]::Match($m, "CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.mwc_guard_work_centre_cost_centre\s*\(").Index
$posTrig   = $m.IndexOf("CREATE TRIGGER trg_work_centre_cost_centre_required")
if ($posFnDef -ge 0 -and $posTrig -ge 0 -and $posFnDef -gt $posTrig) {
    Write-Host "X the trigger is created before the function it executes" -ForegroundColor Red; exit 1
}
Write-Host "+ the trigger follows its function" -ForegroundColor Green

# ── the rules that make this design what it is ──────────────────────────────
# strip comments first: they describe the rules, and a check on raw text would
# match the description instead of the rule (the trap, 8 times over)
$code = [regex]::Replace($m, '--[^\r\n]*', '')

if ($code -notmatch [regex]::Escape("NOT (labour_type = 'casual' AND payment_mode = 'hours_only')")) {
    Write-Host "X a casual worker could be recorded without pay" -ForegroundColor Red; exit 1
}
if ($code -notmatch [regex]::Escape("(payment_mode = 'hours_only' AND payment_account_id IS NULL     AND total_amount = 0)")) {
    Write-Host "X a salaried employee could be PAID from here - double payment" -ForegroundColor Red; exit 1
}
Write-Host "+ casual always paid, salaried never paid from here" -ForegroundColor Green

# separation of duties must be in the functions, not just intended
if ($code -notmatch "الاعتماد من اختصاص المالك أو المدير العام") {
    Write-Host "X approval is not restricted to the owner or general manager" -ForegroundColor Red; exit 1
}
if ($code -notmatch "الصرف من اختصاص محاسب الفرع") {
    Write-Host "X paying is not restricted to the branch accountant" -ForegroundColor Red; exit 1
}
if ($code -notmatch "لا تعتمد صرفاً أنشأتَه بنفسك") {
    Write-Host "X the creator could approve their own request" -ForegroundColor Red; exit 1
}
if ($code -notmatch "لا يُصرف إلا صرف معتمد") {
    Write-Host "X money could leave without approval" -ForegroundColor Red; exit 1
}
Write-Host "+ three separate people: create, approve, pay" -ForegroundColor Green

# The idempotency check must precede the status check, or a second click on Pay
# answers "only an approved payment can be paid (status: paid)" - a message that
# reads as a fault but is a prior success.
#
# Both markers occur ONLY inside plw_pay_labour_payment, so their positions in
# the file settle the order. Extracting the function body first was the earlier
# attempt and it failed: a lazy match ending at $function$ stops at the OPENING
# delimiter, yielding an empty body and a guard that reports "could not locate"
# no matter what the code says. A guard that cannot find what it checks is worse
# than no guard - it fails loudly for the wrong reason.
$posIdem   = $code.IndexOf("journal_entry_id IS NOT NULL")
$posStatus = $code.IndexOf("v_p.status <> 'approved'")
if ($posIdem -lt 0) {
    Write-Host "X the pay function has no idempotency check at all" -ForegroundColor Red; exit 1
}
if ($posStatus -lt 0) {
    Write-Host "X the pay function no longer requires an approved status" -ForegroundColor Red; exit 1
}
if ($posIdem -gt $posStatus) {
    Write-Host "X the idempotency check runs after the status check - a second click reports a false error" -ForegroundColor Red; exit 1
}
Write-Host "+ a second click on Pay reports success, not a confusing error" -ForegroundColor Green

# 835's hole: costing reads only labour and machine minutes
if ($code -notmatch [regex]::Escape("(COALESCE(ro.labor_time_minutes,0) + COALESCE(ro.machine_time_minutes,0)) = 0")) {
    Write-Host "X the routing guard still accepts setup/run time, which costing ignores" -ForegroundColor Red; exit 1
}
Write-Host "+ the routing guard checks the fields costing actually reads" -ForegroundColor Green

# salary confidentiality
if ($code -notmatch [regex]::Escape("'production_labour_wages'")) {
    Write-Host "X the independent permission key is missing" -ForegroundColor Red; exit 1
}
if ($code -match "'accountant',\s*'payroll'" -or $code -match "'manufacturing_officer',\s*'payroll'") {
    Write-Host "X payroll access was granted to the accountant or manufacturing officer - salaries exposed" -ForegroundColor Red; exit 1
}
Write-Host "+ the permission is independent; no one gained access to salaries" -ForegroundColor Green

# writes must be impossible from the browser
foreach ($t in @("casual_workers","production_labour_payments","production_labour_payment_lines")) {
    if ($code -notmatch [regex]::Escape("REVOKE INSERT, UPDATE, DELETE ON public.$t")) {
        Write-Host "X $t is writable from the browser - approval could be bypassed" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all writes go through the atomic functions only" -ForegroundColor Green

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the migration files match the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence - NOT pushing" -ForegroundColor Red; exit 1 }

if (Test-Path "scripts/check-service-role-scoping.js") {
    Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
    node scripts/check-service-role-scoping.js
    if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }
}

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

$files = @("lib/version.ts", "CHANGELOG.md", $mig, "docs/HANDOVER_2026-07-24.md", "push_v3.74.841.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.840.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$stagedMig = (git show ":$mig" 2>$null | Out-String)
if (-not $stagedMig.Contains("plw_pay_labour_payment")) {
    Write-Host "X the staged migration does not carry the appended functions" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged migration carries the functions pulled from the database" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_841.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.841 - production labour wages: record the',
        'actual, value at standard, measure the difference',
        '',
        'The accounting foundation and the data model. The screen follows.',
        '',
        'Manufacturing pays nobody. It reclassifies the value of work out of this',
        "month's expense and into the value of the product (5415 applied labour).",
        'Money leaves in two places only: a salaried employee through payroll, and',
        'a casual worker through a cash or bank payment - which is what this builds.',
        '',
        'WHY THE FIRST PROPOSAL WAS DECLINED. The owner suggested distributing the',
        "manufacturing estimate across the workers, constrained to equal it exactly",
        '- no more, no less. That would make the estimate self-fulfilling: the',
        'variance becomes structurally zero and we lose the one number that reveals',
        'the hourly rate is wrong. And reality does not obey an estimate - a worker',
        'was absent, another did overtime - so forcing actual to equal estimated',
        'means underpaying someone or falsifying a figure, to satisfy software.',
        'The user now enters what was actually paid and the system shows the gap.',
        '',
        'SEPARATION OF DUTIES, as the owner asked: the manufacturing officer',
        'creates and submits, the owner or general manager approves, the branch',
        'accountant pays from his own branch treasury. Three people; nobody',
        'creates, approves and pays.',
        '',
        'SALARY CONFIDENTIALITY. The screen lives under the Employees & Payroll',
        'menu but carries its OWN permission key. Tying it to the payroll',
        'permission would have opened every salary - including the general',
        "manager's - to the branch accountant and the manufacturing officer. Where",
        'a screen sits in a menu and what it grants are two different things.',
        '',
        'A SALARIED EMPLOYEE IS NEVER PAID FROM HERE. Their hours are recorded with',
        'no treasury, no amount and no journal entry, because their salary is',
        'already paid; paying them here would pay them twice. The database refuses',
        'it, not just the screen.',
        '',
        'Verified with 12 checks against production data inside a rolled-back',
        "transaction: another branch's treasury refused, zero total refused, the",
        'same worker twice refused, a casual worker as hours-only refused, payment',
        'without approval refused, approval before submission refused, paying a',
        'salaried record refused; the full cycle posts Dr 5211 100 / Cr 1112 100,',
        'balanced, on the right cost centre, and a second click creates no second',
        'entry.',
        '',
        'THREE DESIGN MISTAKES OF MINE THE TEST CAUGHT:',
        '',
        '  1. The "total > 0" rule sat on the table as a CHECK. The header is',
        '     inserted at zero and the total computed from the lines afterwards, so',
        '     the constraint blocked creation entirely. The rule was right; its',
        '     PLACE was wrong. It moved to the submit gate.',
        '  2. The idempotency check ran after the status check, so a second click',
        '     on Pay returned "only an approved payment can be paid (status: paid)"',
        '     - a message that looks like a fault but is a prior success.',
        '  3. A hole in the 835 guard: it accepted any of four time fields, while',
        '     the costing formula reads labor_time_minutes and machine_time_minutes',
        '     ONLY. A routing with 30 minutes of run time passed the guard and',
        '     still cost zero - the very defect the guard existed to prevent.',
        '',
        'AND A GUARD WITH NO WAY OUT: the cost-centre guard refused to activate a',
        'work centre without a cost centre - and the work-centre screen has no such',
        'field at all. Every prohibition needs a path to compliance. The three live',
        'work centres were set from their branches and the field is being added.',
        '',
        'The function bodies in the migration are pulled from the live database by',
        'append-function-to-migration.js rather than hand-copied - 834 lesson: a',
        'migration is a record of what was applied, not a transcript of it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.841 pushed - actual is recorded, standard values the product, the gap is visible" -ForegroundColor Green
}
