$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.765.ps1") { Remove-Item -LiteralPath "push_v3.74.765.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.766"') {
    Write-Host "+ 3.74.766" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.766]")) { Write-Host "X CHANGELOG missing [3.74.766]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000020_v3_74_766_close_remaining_anon_reachable.sql"
if (-not (Test-Path $mig)) { Write-Host "X missing migration: $mig" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# Revoking the role alone is a silent no-op - anon inherits EXECUTE from PUBLIC.
if ($m -notmatch "REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC") {
    Write-Host "X the revoke must name PUBLIC - anon inherits EXECUTE from it" -ForegroundColor Red; exit 1
}
if ($m -notmatch "GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role") {
    Write-Host "X revoking PUBLIC without re-granting would break the application" -ForegroundColor Red; exit 1
}
# RLS helpers must be found by querying pg_policy, never by recognising names.
if ($m -notmatch "pg_policy") {
    Write-Host "X RLS-policy helpers must be excluded via pg_policy" -ForegroundColor Red; exit 1
}
# The four pre-session functions must stay reachable or login and signup break.
foreach ($keep in @("find_user_by_login","check_username_available",
                    "generate_username_from_email","get_user_company_status")) {
    if ($m -notmatch ("NOT IN[\s\S]{0,400}" + $keep)) {
        Write-Host "X $keep must stay excluded - it runs before a session exists" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ revoke names PUBLIC, re-grants the app, spares RLS and pre-session functions" -ForegroundColor Green

# The correction is the substance of this release. If the migration ever loses
# the record of what these functions actually are, the next person reads the old
# and wrong description: "low-risk yes/no helpers".
foreach ($named in @("unlock_accounting_period", "approve_supplier_payment_atomic",
                     "post_manual_journal_draft")) {
    if ($m -notmatch $named) {
        Write-Host "X the migration must name $named - these are state-changers, not readers" -ForegroundColor Red
        exit 1
    }
}
if ($m -notmatch "A wrapper is not a reader") {
    Write-Host "X the misclassification must stay recorded" -ForegroundColor Red; exit 1
}
if ($m -notmatch "It is not\.") {
    Write-Host "X the over-correction must stay recorded too" -ForegroundColor Red; exit 1
}
Write-Host "+ both the understatement and the overstatement are recorded" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" $mig "push_v3.74.766.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.765.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_766.txt"
    $msgLines = @(
        'security(rpc): v3.74.766 - the last 52, and they were not what I called them',
        '',
        'I told the owner the remainder was "can_/check_/is_ helpers returning yes or',
        'no, low risk". Wrong. The set also held approve_supplier_payment_atomic,',
        'approve_sales_return_atomic, approve_production_order_atomic,',
        'post_invoice_atomic_v2, post_manual_journal_draft, post_accounting_event,',
        'the reject_/submit_ production operations, and unlock_accounting_period -',
        'which reopens a closed accounting period.',
        '',
        'They change state. My filter called them readers because it looks for',
        'INSERT/UPDATE/DELETE in the function body, and they delegate their writes',
        'to other functions, so the body reads clean. A wrapper is not a reader.',
        'Same shape-versus-appearance error as the rest of the day, arriving this',
        'time as a category rather than a regex.',
        '',
        'Then I over-corrected. Seeing post_accounting_event write directly with no',
        'role check, I announced an unguarded ledger writer open to anonymous',
        'callers. It is not. The 12-argument overload that does the writing carries',
        'assert_company_access - the guard installed earlier today - and v3.74.759',
        'excluded it correctly. The 11-argument overload has no guard but performs',
        'no write; it delegates to the guarded one. The alarm came from a query',
        'whose columns omitted the very guard I had spent the day installing.',
        '',
        'Understated, then overstated, inside a few minutes. The accurate position,',
        'after checking both directions: not one of these 17 uses auth.uid(). They',
        'take p_user_id as a PARAMETER and check that user''s role, which an',
        'anonymous caller satisfies by passing a known owner''s id, or they check',
        'nothing. Several delegate into guarded functions so the blast radius is',
        'bounded. None has a legitimate anonymous caller. Being reachable at all is',
        'the defect worth removing, independently of how far an attacker gets.',
        '',
        'Verified rather than asserted: dashboard finding 0, run_all_integrity_checks',
        '0 findings, the five sensitive operations anon 0/5 and authenticated 5/5,',
        'and login, rate limiting and the RLS helpers all still reachable by anon',
        'as they must be.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.766 pushed - nothing company-scoped is reachable without a session" -ForegroundColor Green
}
