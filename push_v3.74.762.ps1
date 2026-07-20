$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.761.ps1") { Remove-Item -LiteralPath "push_v3.74.761.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.762"') {
    Write-Host "+ 3.74.762" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.762]")) { Write-Host "X CHANGELOG missing [3.74.762]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$revoke = "supabase/migrations/20260720000015_v3_74_762_close_anon_reachable_readers.sql"
$watch  = "supabase/migrations/20260720000016_v3_74_762_ic_anon_reachable_readers.sql"
foreach ($m in @($revoke, $watch)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}

# The whole defect of the first attempt was revoking the role without PUBLIC.
# A REVOKE that names anon alone runs cleanly and changes nothing.
$rv = Get-Content -LiteralPath $revoke -Raw
if ($rv -notmatch "REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC") {
    Write-Host "X the revoke must name PUBLIC too - anon inherits EXECUTE from it" -ForegroundColor Red
    exit 1
}
# Revoking PUBLIC strips the app as well unless it is re-granted.
if ($rv -notmatch "GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role") {
    Write-Host "X revoking PUBLIC without re-granting authenticated would break the app" -ForegroundColor Red
    exit 1
}
# Auth-flow functions must never appear in the revoke set.
foreach ($keep in @("find_user_by_login", "check_username_available", "generate_username_from_email")) {
    if ($rv -notmatch ("NOT IN[\s\S]{0,300}" + $keep)) {
        Write-Host "X $keep must stay excluded - it runs before a session exists" -ForegroundColor Red
        exit 1
    }
}
# RLS-referenced functions must be excluded by querying pg_policy, not by name.
if ($rv -notmatch "pg_policy") {
    Write-Host "X the revoke must exclude RLS-policy helpers via pg_policy" -ForegroundColor Red
    exit 1
}
Write-Host "+ revoke migration names PUBLIC, re-grants the app, spares auth and RLS helpers" -ForegroundColor Green

$wt = Get-Content -LiteralPath $watch -Raw
if ($wt -notmatch "ic_anon_reachable_readers") { Write-Host "X watcher missing" -ForegroundColor Red; exit 1 }
if ($wt -notmatch "TESTRESULT >> tracked_before=104") {
    Write-Host "X the watcher's sabotage evidence must stay recorded" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher registered with its sabotage evidence" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" $revoke $watch "push_v3.74.762.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.761.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_762.txt"
    $msgLines = @(
        'security(rpc): v3.74.762 - the balance sheet was readable without logging in',
        '',
        'Every sweep this week searched for functions that WRITE. None looked at',
        'functions that only READ. About 180 SECURITY DEFINER readers had EXECUTE',
        'granted to anon, including get_balance_sheet, get_income_statement, all',
        'three get_trial_balance overloads, get_audit_trail_report,',
        'search_audit_trail and get_employee_commission_summary_for_payroll.',
        '',
        'SECURITY DEFINER bypasses row-level security; EXECUTE to anon means the',
        'publishable key in every browser bundle can call them. Anyone holding a',
        'company UUID could read that company''s financial statements, payroll',
        'commissions and audit trail without a session. Company UUIDs are not',
        'secret - they are in URLs and exports, and every former employee knows',
        'theirs. 46 closed.',
        '',
        'I got it wrong on the first pass. The migration said REVOKE ... FROM anon,',
        'executed 46 statements with no error, and closed almost nothing: REVOKE',
        'FROM a role does not remove a privilege held via PUBLIC, and Postgres',
        'grants function EXECUTE to PUBLIC by default. Verifying afterwards showed',
        'eight of the headline readers still open. v3.74.759 had written "FROM anon,',
        'PUBLIC" correctly and this migration dropped the second half. A migration',
        'that runs clean and does nothing is the same failure as a cron that reports',
        'success and writes nothing.',
        '',
        'Revoking PUBLIC also strips authenticated and service_role where they held',
        'access only through it, so both are re-granted explicitly. Verified after:',
        'the ten headline signatures are anon=false, authenticated=true,',
        'service_role=true.',
        '',
        'Two exclusions, both verified rather than assumed. Nine of these readers',
        'are called from inside RLS policy expressions - a policy runs as the',
        'querying role, so revoking anon there would break row-level security',
        'instead of tightening it; identified from pg_policy, not from names. And',
        'find_user_by_login, check_username_available, generate_username_from_email',
        'and get_user_company_status run before a session exists. Same reasoning',
        'that spared check_and_increment_rate_limit in .759.',
        '',
        '104 readers remain open: the ic_*, can_*, check_* and is_* families. They',
        'disclose far less - booleans and counts - but they are still company data',
        'without a session, and they survived only because my filter keyed on name',
        'prefixes as a safety rail against sweeping 180 functions blind. Rather',
        'than describe this as finished, they are registered as a dashboard finding,',
        'ic_anon_reachable_readers, proven by sabotage: granting the balance sheet',
        'back moved it from 104 to 105 and named the function.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.762 pushed - financial statements now require a session" -ForegroundColor Green
}
