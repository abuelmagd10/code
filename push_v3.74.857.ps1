$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.856.ps1") { Remove-Item -LiteralPath "push_v3.74.856.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.857"') {
    Write-Host "+ 3.74.857" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.857]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.857]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig  = "supabase/migrations/20260727000003_v3_74_857_close_anon_open_tables.sql"
$mig2 = "supabase/migrations/20260727000004_v3_74_857_audit_policy_must_match_assert_company_access.sql"
$guard= "scripts/check-anon-open-tables.js"
$log  = "lib/logger.ts"
$adm  = "app/saas-admin/page.tsx"
$admj = "app/saas-admin/jobs/page.tsx"
$sign = "app/auth/sign-up/page.tsx"
$cb   = "app/auth/callback/page.tsx"
$stray= "scripts/check-users-without-company.js"
$self = "scripts/selftest-anon-open-tables.js"

$files = @("lib/version.ts", "CHANGELOG.md", $mig, $mig2, $guard, $self, $log, $adm, $admj,
           $sign, $cb, $stray, "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.857.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.856.ps1" 2>$null

foreach ($f in @($mig, $mig2, $guard, $self, $log, $adm, $admj, $sign, $cb, $stray)) {
    if (-not (Test-Path $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

# ── 1. logging must not run on the caller's permissions ────────────────────
# system_logs was readable AND deletable by any anonymous visitor for one
# reason: lib/logger.ts wrote as the logged-in user, so the table had to be
# granted to users. Logging is infrastructure - it must succeed on requests
# with no session at all (failed sign-ins are precisely what we want logged),
# and it must never be writable by the caller it is logging.
$lg = Get-Content -LiteralPath $log -Raw
$lgCode = ($lg -split "`n" | Where-Object { $_ -notmatch "^\s*(//|\*|/\*)" }) -join "`n"
if ($lgCode -notmatch [regex]::Escape("createServiceClient()")) {
    Write-Host "X lib/logger.ts still writes system_logs as the caller" -ForegroundColor Red
    Write-Host "  Then system_logs must stay granted to users - which is the hole." -ForegroundColor Red
    exit 1
}
if ($lgCode -match "await\s+createClient\(\)") {
    Write-Host "X lib/logger.ts still calls the user client" -ForegroundColor Red; exit 1
}
Write-Host "+ logging runs on the service account, not on the caller" -ForegroundColor Green

# ── 2. the platform dashboards read platform-wide, so they need the service ─
# They queried system_logs / jobs_queue / subscriptions with no company filter
# and only ever worked because those tables were open to everyone. The gate is
# app/saas-admin/layout.tsx (SAAS_ADMIN_EMAILS), which runs before these pages.
foreach ($p in @($adm, $admj)) {
    $t = Get-Content -LiteralPath $p -Raw
    $tCode = ($t -split "`n" | Where-Object { $_ -notmatch "^\s*(//|\*|/\*)" }) -join "`n"
    if ($tCode -notmatch [regex]::Escape("createServiceClient()")) {
        Write-Host "X $p would silently show partial data after the lockdown" -ForegroundColor Red; exit 1
    }
}
if (-not (Test-Path "app/saas-admin/layout.tsx")) {
    Write-Host "X the saas-admin gate is missing - service-role reads would be ungated" -ForegroundColor Red; exit 1
}
$lay = Get-Content -LiteralPath "app/saas-admin/layout.tsx" -Raw
if ($lay -notmatch "SAAS_ADMIN_EMAILS" -or $lay -notmatch "redirect") {
    Write-Host "X the saas-admin gate no longer restricts access" -ForegroundColor Red; exit 1
}
Write-Host "+ platform dashboards read platform-wide, behind the admin gate" -ForegroundColor Green

# ── 3. signup must no longer need DELETE as an anonymous visitor ────────────
# The pre-delete on sign-up is what forced `anon` to hold DELETE on
# pending_companies - which let anyone on the internet wipe any customer's
# backup. That is the same data loss as 856, but reachable without any bug.
$sg = Get-Content -LiteralPath $sign -Raw
$sgCode = ($sg -split "`n" | Where-Object { $_ -notmatch "^\s*(//|\*|/\*)" }) -join "`n"
$delIdx = [regex]::Match($sgCode, "from\('pending_companies'\)[\s\S]{0,120}?\.delete\(\)")
if ($delIdx.Success) {
    Write-Host "X sign-up still deletes pending_companies as an anonymous visitor" -ForegroundColor Red
    Write-Host "  That grant is what let anyone erase any customer's company name." -ForegroundColor Red
    exit 1
}
if ($sgCode -notmatch [regex]::Escape("from('pending_companies')")) {
    Write-Host "X sign-up no longer saves the company name at all" -ForegroundColor Red; exit 1
}
Write-Host "+ signup saves the backup without needing delete rights" -ForegroundColor Green

# ── 4. and the callback must tolerate more than one row ────────────────────
# Without the pre-delete a repeated signup leaves two rows. `.single()` errors
# on that, and the error is not checked - the company name would be replaced by
# the default silently. Newest row wins.
$cc = Get-Content -LiteralPath $cb -Raw
$ccCode = ($cc -split "`n" | Where-Object { $_ -notmatch "^\s*(//|\*|/\*)" }) -join "`n"
$readBlock = [regex]::Match($ccCode, "from\('pending_companies'\)[\s\S]{0,400}")
if (-not $readBlock.Success -or $readBlock.Value -notmatch "maybeSingle\(\)") {
    Write-Host "X the callback still requires exactly one backup row" -ForegroundColor Red; exit 1
}
if ($readBlock.Value -notmatch [regex]::Escape("ascending: false")) {
    Write-Host "X the callback does not take the newest backup row" -ForegroundColor Red; exit 1
}
Write-Host "+ the callback takes the newest backup, never fails on duplicates" -ForegroundColor Green

# ── 5. the migration must close, not merely rename ─────────────────────────
$mg = Get-Content -LiteralPath $mig -Raw
foreach ($need in @("system_logs_service_role", "rate_limits_service_role",
                    "service_role_full_access_jobs", "app_events_service_role",
                    "onboarding_service_write", "subscriptions_service_write",
                    "usage_metrics_service_write", "service_role_can_insert_escalations")) {
    if ($mg -notmatch ("DROP POLICY IF EXISTS " + $need)) {
        Write-Host "X the migration does not drop $need" -ForegroundColor Red; exit 1
    }
}
if ($mg -notmatch [regex]::Escape("REVOKE ALL ON public.system_logs FROM anon, authenticated")) {
    Write-Host "X the anon grant on system_logs is not revoked" -ForegroundColor Red; exit 1
}
if ($mg -notmatch [regex]::Escape("pending_companies_owner_select")) {
    Write-Host "X pending_companies is not tied to its owner's email" -ForegroundColor Red; exit 1
}
Write-Host "+ the migration drops the open policies and revokes the grants" -ForegroundColor Green

# ── 5b. every company guard must match assert_company_access, not half of it ─
# The first cut of audit_logs_insert used fn_user_company_ids() alone, which
# reads company_members only - reintroducing the v3.74.836 defect one layer
# down: the membership row is written AFTER the company INSERT returns, so the
# creator is a stranger to their own company for the length of that statement,
# and every bootstrap trigger that logs an audit row kills the signup.
# verify-signup-path caught it: "chart of accounts seeded only 0".
# A lesson recorded in a FUNCTION does not carry over to a POLICY by itself.
$mg2 = Get-Content -LiteralPath $mig2 -Raw
if ($mg2 -notmatch [regex]::Escape("fn_user_company_access")) {
    Write-Host "X the shared company-access helper is missing" -ForegroundColor Red; exit 1
}
if ($mg2 -notmatch "FROM companies[\s\S]{0,80}user_id = auth\.uid\(\)") {
    Write-Host "X the helper does not accept the company's own creator" -ForegroundColor Red
    Write-Host "  Then company bootstrap dies again exactly as in 836." -ForegroundColor Red
    exit 1
}
# CREATE FUNCTION grants EXECUTE to PUBLIC - and PUBLIC includes anon (844).
if ($mg2 -notmatch "REVOKE ALL ON FUNCTION public\.fn_user_company_access\(uuid\) FROM PUBLIC, anon") {
    Write-Host "X the new function is left executable by anonymous callers" -ForegroundColor Red; exit 1
}
$mg2Code = ($mg2 -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"
if ($mg2Code -match "audit_logs_insert[\s\S]{0,200}fn_user_company_ids") {
    Write-Host "X audit_logs_insert still uses membership alone" -ForegroundColor Red; exit 1
}
Write-Host "+ company guards match assert_company_access, creator included" -ForegroundColor Green

# ── 6. the temporary exception must be gone now its reason is gone ─────────
# maxaboelmagd@gmail.com was excused while his company did not exist. It does
# now - verified on production: owner, 95 accounts, 1 branch, 1 warehouse.
# An exception outliving its reason is a permanent hole.
$st = Get-Content -LiteralPath $stray -Raw
$stCode = ($st -split "`n" | Where-Object { $_ -notmatch "^\s*(//|\*|/\*)" }) -join "`n"
if ($stCode -match "maxaboelmagd") {
    Write-Host "X the temporary exception is still in the KNOWN set" -ForegroundColor Red; exit 1
}
Write-Host "+ the temporary exception was removed with its reason" -ForegroundColor Green

# ── 7. THE GUARD MUST BE SEEN REFUSING ─────────────────────────────────────
# A guard reporting zero proves nothing until it refuses the very thing it was
# written for. Plant an open policy on a scratch table granted to anon, and
# fail the release if the guard stays silent. (833, 845, 851, 853 all shipped
# past guards that were quietly asleep.)
Write-Host "Proving the anon-table guard actually refuses..." -ForegroundColor Cyan
node scripts/selftest-anon-open-tables.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X the guard was not seen refusing - NOT pushing" -ForegroundColor Red; exit 1
}

Write-Host "Checking no table is open to anonymous visitors..." -ForegroundColor Cyan
node scripts/check-anon-open-tables.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X tables are still open to anon" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.856.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_857.txt"
    $msgLines = @(
        'security(rls): v3.74.857 - twelve tables were open to any anonymous visitor',
        '',
        'Nobody reported this. It surfaced during routine cleanup of leftover',
        'pending_companies rows after 856: the question "who can read this table?"',
        'had the answer "everyone", and widening the question found eleven more.',
        '',
        'One root cause, repeated twelve times. Policies named *_service_role and',
        '*_service_write were written without TO service_role. In Postgres a',
        'permissive policy with no role targets PUBLIC - which includes anon, and',
        'the anon key is published in the browser, so anon means anyone at all.',
        'Permissive policies OR together, so a single USING (true) cancels every',
        'carefully scoped policy beside it: jobs_queue stayed wide open despite',
        'jobs_queue_no_user_insert sitting right next to it with CHECK (false).',
        '',
        'And service_role has rolbypassrls = true. It bypasses RLS anyway. These',
        'policies never helped anyone; their only effect was to hold the door open.',
        '',
        'What was exposed:',
        '',
        '  system_logs           174,638 rows - readable AND deletable by anyone',
        '  audit_logs              2,723 rows - anyone could INSERT forged entries',
        '  subscriptions / usage_metrics    - billing data, readable and writable',
        '  api_rate_limits                  - clear your own attempts, retry freely',
        '  jobs_queue                       - control background work',
        '  pending_companies           6    - every signup email + company name,',
        '                                     and delete anyone backup row',
        '  onboarding_progress / app_events / notification_escalations',
        '',
        'pending_companies deserves a note. The 856 defect was two lines in the',
        'wrong order. Here the identical damage was available to any passer-by',
        'with no bug at all.',
        '',
        'Two further gaps fell out of tracing the callers:',
        '',
        '  - app/api/onboarding/complete-step takes company_id straight from the',
        '    request body with no membership check whatsoever. The new policy',
        '    enforces in the database what the route forgot.',
        '  - lib/logger.ts wrote system_logs as the logged-in user, which is why',
        '    the table had to be granted to users in the first place. Logging is',
        '    infrastructure: it must work on requests with no session - failed',
        '    sign-ins above all - and must never depend on the caller. It now uses',
        '    the service client. The two saas-admin dashboards did the same and',
        '    were changed likewise, behind their SAAS_ADMIN_EMAILS gate.',
        '',
        'Sign-up no longer deletes before inserting: that pre-delete is precisely',
        'what forced anon to hold DELETE. The callback now takes the newest backup',
        'with maybeSingle() instead of demanding exactly one with .single(), whose',
        'error was unchecked and would have replaced the company name in silence.',
        '',
        'Proven on production inside a rolled-back transaction, actually running as',
        'anon: refused reading and deleting the logs, reading customer emails and',
        'deleting their backups, forging an audit entry, editing subscriptions,',
        'clearing rate limits and touching the job queue - while signup could still',
        'save a company name and the public reference tables still read.',
        '',
        'A new standing guard, check-anon-open-tables, baseline zero, and the push',
        'plants an open table to prove the guard refuses it. The previous guard',
        'checked functions; the hole was in tables. A guard on one gate does not',
        'protect another - the fourth time that lesson has cost us a release.',
        '',
        'No row was deleted anywhere except one corrupt pending_companies record',
        'whose user_email was "water way" - not an address, so it could never match',
        'any account, and an intact row with the same company name exists beside it.',
        'The ledgers were untouched: 126 journal entries, 5 companies.',
        '',
        'Also removed maxaboelmagd@gmail.com from the stranded-user exception list.',
        'He now owns a complete company - 95 accounts, a branch, a warehouse - so',
        'the exception has outlived its reason, and an exception that outlives its',
        'reason is a permanent hole.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.857 pushed - no table is open to anonymous visitors" -ForegroundColor Green
}
