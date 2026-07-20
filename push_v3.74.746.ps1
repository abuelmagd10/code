$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.745.ps1") { Remove-Item -LiteralPath "push_v3.74.745.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.746"') {
    Write-Host "+ 3.74.746" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.746]")) { Write-Host "X CHANGELOG missing [3.74.746]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260720000003_v3_74_746_revoke_anon_row_id_writers.sql"
$m2 = "supabase/migrations/20260720000004_v3_74_746_ic_covers_row_id_writers.sql"
foreach ($f in @($m1, $m2)) {
    if (-not (Test-Path $f)) { Write-Host "X missing migration: $f" -ForegroundColor Red; exit 1 }
}
$r1 = Get-Content -LiteralPath $m1 -Raw
$r2 = Get-Content -LiteralPath $m2 -Raw

# The scope is the whole point. v3.74.727 only looked at functions taking
# company_id; these reach a company through a row id instead. Narrowing this
# back would silently re-hide 48 functions.
if ($r1 -notmatch "NOT ILIKE '%company_id%'" -or $r1 -notmatch "~ '_id uuid'") {
    Write-Host "X the sweep no longer targets row-id writers - the blind spot returns" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "FROM PUBLIC, anon") {
    Write-Host "X the sweep does not revoke anon" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "TO authenticated, service_role") {
    Write-Host "X the sweep revokes without re-granting - the app would break" -ForegroundColor Red; exit 1
}
Write-Host "+ sweep targets row-id writers, revokes anon, keeps the app working" -ForegroundColor Green

# The watcher must count BOTH shapes, or it reports CLEAN over an open class -
# which is exactly what it did until today.
if ($r2 -notmatch "takes_company_id") {
    Write-Host "X the watcher no longer distinguishes the two shapes" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "OR pg_get_function_identity_arguments\(p\.oid\) ~ '_id uuid'") {
    Write-Host "X the watcher is blind to row-id writers again - it would report CLEAN over 48 of them" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "معرّف سجل") {
    Write-Host "X the row-id finding has no subject line" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher covers both shapes and reports them separately" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed" -and [int]$Matches[1] -gt 60) {
    Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1
}
Write-Host "+ critical tests as expected" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" "$m1" "$m2" "push_v3.74.746.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.745.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_746.txt"
    $msgLines = @(
        'security: v3.74.746 - CLEAN was true inside its scope and false in reality',
        '',
        'Started by surveying the dormant modules - fixed assets, payroll,',
        'transfers, credit notes. All four hold zero rows: never used. So the',
        'question is not whether they work, but what they would do to the accounts',
        'the first time a real client touched them.',
        '',
        'What turned up is bigger than those modules.',
        '',
        'delete_fixed_asset_completely(p_asset_id), post_payroll_run_atomic(',
        'p_payroll_run_id), record_payment(p_invoice_id, ...) and',
        'execute_sales_invoice_accounting(p_invoice_id) were all callable by anon.',
        'record_payment alone means anyone, with no account whatsoever, could',
        'record a payment against any invoice in any company.',
        '',
        'My v3.74.727 sweep never saw them. It revoked anon from unguarded writers',
        'that take company_id as an argument, and that scope was wrong: a function',
        'does not need company_id to reach a company''s data - a row id will do,',
        'because the company can be read from the row. 48 functions in that blind',
        'spot, all anon-callable, 19 touching the ledger, 3 deleting from it.',
        '',
        'And ic_exposed_definer_functions reported CLEAN the whole time, because it',
        'inherited the same assumption. I passed that CLEAN on to the owner',
        'yesterday. The checker was accurate within its scope; the scope was the',
        'defect. A clean report is worth exactly as much as the question behind it.',
        '',
        'Phase 1 applied, matching v3.74.727: anon goes from 48 to 0, authenticated',
        'and service_role keep their grants, application behaviour unchanged.',
        'Verified beforehand that none of the 48 is a pre-login flow - they are',
        'approvals, notifications, FIFO maintenance, returns and posting routines.',
        '',
        'The watcher now reports three findings rather than one, because the',
        'remedies differ: anon-reachable needs a revoke; company_id-unguarded needs',
        'assert_company_access; row-id-unguarded cannot call it at all, having no',
        'company_id to pass, and must resolve the owning company from its row',
        'first. That is 48 individual pieces of work, not a sweep, and the',
        'dashboard now says so instead of staying silent.',
        '',
        'Still open on the modules themselves: delete_fixed_asset_completely and',
        'force_delete_all_depreciation_schedules DELETE journal entries rather than',
        'reversing them - the same pattern retired in v3.74.733. Next.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.746 pushed - anon closed on 48 row-id writers" -ForegroundColor Green
}
