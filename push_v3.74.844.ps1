$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.843.ps1") { Remove-Item -LiteralPath "push_v3.74.843.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.844"') {
    Write-Host "+ 3.74.844" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.844]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.844]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$page = "app/hr/production-labour/page.tsx"
$mig  = "supabase/migrations/20260726000011_v3_74_844_lock_new_function_grants.sql"

# ── stage FIRST, then check ─────────────────────────────────────────────────
# Several checks read git state: the referenced-scripts guard fails on a new
# script that is not tracked yet, and the migration/database guard cannot see an
# untracked file at all. Staging at the END of the script - as this one first
# did - makes those checks depend on the order of operations rather than on the
# content. Stage up front; the later `git add` is then a harmless no-op.
$files = @("lib/version.ts", "CHANGELOG.md", $page, $mig,
           "scripts/check-anon-reachable-functions.js", "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.844.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.843.ps1" 2>$null

$p = Get-Content -LiteralPath $page -Raw
$m = Get-Content -LiteralPath $mig  -Raw

# ── the screen must use the project's shell, not its own layout ─────────────
foreach ($c in @("PageGuard", "CompanyHeader", "ERPPageHeader")) {
    if ($p -notmatch [regex]::Escape("<$c")) {
        Write-Host "X the screen does not use $c - it will not look like the rest of the app" -ForegroundColor Red; exit 1
    }
}
if ($p -notmatch [regex]::Escape('resource="production_labour_wages"')) {
    Write-Host "X PageGuard is not bound to the independent permission" -ForegroundColor Red; exit 1
}
Write-Host "+ standard page shell, guarded by its own permission" -ForegroundColor Green

# language must come from the project mechanism, not a private dir/dictionary
if ($p -notmatch [regex]::Escape("app_language_changed")) {
    Write-Host "X the screen does not follow the app's language switch" -ForegroundColor Red; exit 1
}
if ($p -match 'dir=\{lang ===') {
    Write-Host "X the screen sets its own direction - it will fight the rest of the app" -ForegroundColor Red; exit 1
}
if ($p -notmatch [regex]::Escape('const t = (en: string, ar: string)')) {
    Write-Host "X the screen does not use the project's t(en, ar) helper" -ForegroundColor Red; exit 1
}
Write-Host "+ language and direction come from the app, not the page" -ForegroundColor Green

# Project UI components, not raw HTML controls.
#
# `-cmatch`, NOT `-match`: PowerShell's -match is case-INSENSITIVE by default,
# so `<select` also matched the project's `<Select>` component and the check
# failed on a correct page. Case is the whole distinction being tested here;
# a case-insensitive test cannot make it.
if ($p -cmatch '<select[\s>]') {
    Write-Host "X raw <select> found - use the project's Select component" -ForegroundColor Red; exit 1
}
if ($p -cnotmatch '<Select[\s>]') {
    Write-Host "X the project's Select component is not used at all" -ForegroundColor Red; exit 1
}
Write-Host "+ project UI components throughout" -ForegroundColor Green

# ── every function created in 841/843 must be closed to anon ────────────────
foreach ($fn in @("plw_caller_role", "plw_next_payment_no", "plw_create_labour_payment",
                  "plw_submit_labour_payment", "plw_approve_labour_payment",
                  "plw_reject_labour_payment", "plw_pay_labour_payment",
                  "plw_upsert_casual_worker", "mr_assert_routing_operations_costable",
                  "mpoe_assert_materials_issued_before_receipt")) {
    if ($m -notmatch ("REVOKE ALL ON FUNCTION public\." + [regex]::Escape($fn))) {
        Write-Host "X $fn is not revoked from PUBLIC - CREATE FUNCTION leaves it open to anon" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all ten functions revoked from PUBLIC" -ForegroundColor Green

# the internal helpers must not be reachable by a logged-in user either
foreach ($fn in @("plw_caller_role", "plw_next_payment_no")) {
    if ($m -notmatch ("REVOKE ALL ON FUNCTION public\." + [regex]::Escape($fn) + "[^\n]*authenticated")) {
        Write-Host "X internal helper $fn is still exposed to authenticated callers" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ internal helpers closed to callers entirely" -ForegroundColor Green

# ── and the live database must agree: zero anon-reachable company readers ───
# A real script file, not inline JS in a PowerShell string: the first attempt
# embedded JavaScript here and PowerShell mangled the backticks, so node died on
# a syntax error and the check "failed" for a reason unrelated to security. A
# check worth running is worth its own file - and this one now runs in CI too.
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

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.843.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_844.txt"
    $msgLines = @(
        'fix(hr,security): v3.74.844 - put the screen on the standard shell, and',
        'close functions that CREATE FUNCTION had left open to anonymous callers',
        '',
        'TWO THINGS, both reported by the owner within minutes of the release.',
        '',
        '1. The screen looked like it came from a different application. I built it',
        'on a bare div with its own layout and its own language dictionary, so it',
        'rendered without the company header, without the page header, and with its',
        'title clipped at the edge of the viewport. It now uses PageGuard +',
        'CompanyHeader + ERPPageHeader like every other page, the project Select',
        'component instead of raw <select>, and takes language and direction from',
        "the app's own mechanism rather than managing them itself - a page that",
        'decides its own direction fights the rest of the system.',
        '',
        'A new screen starts from the shell the existing screens use, not from a',
        'blank page.',
        '',
        "2. The system-integrity panel on the owner's dashboard reported: functions",
        'that read company data and can be called without signing in - one medium',
        'drift, naming plw_next_payment_no, which I wrote in 841.',
        '',
        'CREATE FUNCTION grants EXECUTE to PUBLIC by default, and PUBLIC includes',
        'anon. Granting explicitly to authenticated afterwards does NOT remove the',
        'inherited grant - so the line that appears to restrict the function does',
        'nothing of the sort. Auditing everything created yesterday and today found',
        'TEN such functions, not one: the whole labour-payment workflow, its',
        'helpers, and two guards.',
        '',
        'The real exposure was modest - plw_next_payment_no would reveal payment',
        'numbering for any company id a stranger cared to try - and the workflow',
        'functions check the role internally and refuse an anonymous caller. But',
        'exposing them at all is a defence left open on the assumption that another',
        'one is holding. Internal helpers are now revoked from everyone (they run',
        "as their owner inside the calling function, so nothing breaks), and the",
        'workflow functions are revoked from PUBLIC and granted to authenticated.',
        '',
        'ic_anon_reachable_readers on production now returns zero.',
        '',
        'Every new function must be explicitly revoked from PUBLIC and then granted',
        'to whoever needs it; an explicit grant is not a substitute for the revoke.',
        '',
        'Worth recording: none of the guards I built today caught this. The',
        "project's own integrity check did - the guards already in place deserve to",
        'be read, not only added to.',
        '',
        'Two further corrections while getting this out, both of the same family:',
        '',
        '  - The first version of check-anon-reachable-functions.js dropped one',
        '    condition the database check has: it excludes functions referenced',
        '    inside RLS policy expressions. Without it the script flagged nine',
        '    perfectly correct functions - can_access_invoice_items,',
        '    ic_user_can_access_consolidation_group and others, one of them used by',
        '    thirty-two policies. Those MUST keep EXECUTE for anon or the policies',
        '    cannot be evaluated; revoking would have broken row-level security',
        '    across invoices, bills, journal lines and intercompany rather than',
        '    tightening anything. A false positive is not merely noise - it argues',
        '    for breaking something that works. When copying an existing check,',
        '    copy all of it: each condition probably encodes a constraint someone',
        '    learned the hard way.',
        '  - Staging moved to the top of the push script. The referenced-scripts',
        '    guard correctly refused a brand-new script that was not tracked yet,',
        '    because staging happened at the end - the same order-dependence 842',
        '    fixed in the migration check. Checks that read git state must run',
        '    against the state that will actually be committed.',
        '',
        'And a sixth guard bug of my own while writing this one: the check for raw',
        '<select> used -match, which is case-INSENSITIVE in PowerShell, so it also',
        "matched the project's <Select> component and failed on a correct page. Case",
        'was the entire distinction being tested; a case-insensitive test cannot make',
        'it. It uses -cmatch now, and additionally requires that <Select> IS present,',
        'so the check cannot pass by the page having no dropdowns at all.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.844 pushed - one shell for every screen, and no function open by default" -ForegroundColor Green
}
