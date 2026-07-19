$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.730.ps1") { Remove-Item -LiteralPath "push_v3.74.730.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.731"') {
    Write-Host "+ 3.74.731" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.731]")) { Write-Host "X CHANGELOG missing [3.74.731]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260719000734_v3_74_731_guard_remaining_nineteen.sql"
$m2 = "supabase/migrations/20260719000735_v3_74_731_guard_last_four.sql"
foreach ($m in @($m1, $m2)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}
$r1 = Get-Content -LiteralPath $m1 -Raw
$r2 = Get-Content -LiteralPath $m2 -Raw

# Bootstrap variant: without the "company has no members yet" escape, guarding
# create_branch_atomic rejects the first branch of a brand-new company.
if ($r1 -notmatch "NOT EXISTS \(SELECT 1 FROM company_members WHERE company_id = p_company_id\)") {
    Write-Host "X the bootstrap escape is gone - new company signup would break" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "assert_company_access_or_bootstrap") {
    Write-Host "X bootstrap functions no longer use the bootstrap variant" -ForegroundColor Red; exit 1
}
Write-Host "+ bootstrap variant present and used" -ForegroundColor Green

# Both guards must stay uncatchable (see v3.74.730).
foreach ($pair in @(@($r1,'batch'), @($r2,'last-four'))) {
    if ($pair[0] -match "ERRCODE = '42501'") {
        Write-Host "X 42501 is back in the $($pair[1]) migration - WHEN OTHERS swallows it" -ForegroundColor Red; exit 1
    }
}
if ($r1 -notmatch "ERRCODE = '57014'") {
    Write-Host "X the bootstrap guard no longer raises 57014" -ForegroundColor Red; exit 1
}
Write-Host "+ guards still uncatchable" -ForegroundColor Green

# The last four were skipped silently by the earlier anchor. The wider anchor
# must raise rather than CONTINUE, so a future skip is loud instead of silent.
if ($r2 -notmatch "RAISE EXCEPTION 'no BEGIN found in %'") {
    Write-Host "X the last-four patcher skips silently again - that is how these four were missed" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "LANGUAGE plpgsql") {
    Write-Host "X increment_usage_metric is not being rewritten to plpgsql" -ForegroundColor Red; exit 1
}
Write-Host "+ last-four patcher fails loudly, sql function rewritten" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$m1" "$m2" "push_v3.74.731.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.730.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_731.txt"
    $msgLines = @(
        'security: v3.74.731 - cross-tenant exposure closed, 116 -> 0',
        '',
        'The 19 held back were decided one group at a time against their real call',
        'sites, not by rule. Seat and subscription functions turned out to be called',
        'exclusively through admin.rpc - the service_role client - in',
        'lib/billing/seat-service.ts, the reactivate route and the renewal cron, so',
        'auth.uid() is null there and the standard guard no-ops while still closing',
        'the browser route. Reconciliation, notifications and idempotency run either',
        'server-side or on behalf of a member: standard guard.',
        '',
        'Bootstrap is the genuine exception. create_branch_atomic and',
        'seed_default_role_permissions can run before membership exists, so a',
        'membership check would reject the first branch of a brand-new company. They',
        'use a variant that passes when the company has no members at all - real',
        'setup rather than impersonation. create_branch_atomic''s live call site is',
        'already safe (apiGuard + requireRole, companyId from session context and',
        'never the body); the variant is used anyway, because correctness should not',
        'depend on one route staying careful.',
        '',
        'Then the counter stopped at 4 instead of 0. Three functions store their',
        'entire body on a single line, so the patcher''s "\nBEGIN" anchor never',
        'matched and it skipped them - no error, no warning, nothing. They stayed',
        'exposed while everything around them was fixed. The fourth,',
        'increment_usage_metric, is LANGUAGE sql: no statement list to prepend a',
        'guard to, so it was rewritten as plpgsql with an identical body.',
        '',
        'This is the entire justification for building the counter first. Without',
        'it I would have declared the sweep finished with four functions still open,',
        'and every migration would have reported success. A migration that succeeds',
        'is not a migration that worked. The new patcher raises instead of skipping,',
        'so the next mismatch is loud.',
        '',
        'Verified by calling the functions, not by reading them: outsider rejected',
        'on sync_all_stock_quantities and increment_usage_metric, member allowed,',
        'bootstrap variant allows an existing member. Watcher now reports clean;',
        '88 functions carry a guard.',
        '',
        'Still open: 57014 surfaces through PostgREST with a timeout-ish status.',
        'Worth translating in the client error handler.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.731 pushed - cross-tenant exposure closed" -ForegroundColor Green
}
