$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.839.ps1") { Remove-Item -LiteralPath "push_v3.74.839.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.840"') {
    Write-Host "+ 3.74.840" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.840]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.840]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260726000008_v3_74_840_audit_is_a_witness_not_a_judge.sql"
$grd = "scripts/check-audit-cannot-abort.js"
$files = @("lib/version.ts", "CHANGELOG.md", $mig, $grd, "package.json",
           ".github/workflows/ci.yml", "docs/HANDOVER_2026-07-24.md", "push_v3.74.840.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.839.ps1" 2>$null

# Strip SQL comments before judging: the comments in these functions name the
# authorisation check in order to explain its absence. A check that forbade the
# string would forbid the explanation - the trap this project has hit 8 times.
$mRaw = Get-Content -LiteralPath $mig -Raw
$m = [regex]::Replace($mRaw, '--[^\r\n]*', '')

# --- all five audit paths use the non-authorising logger ---------------------
$internalCalls = ([regex]::Matches($m, [regex]::Escape("create_audit_log_internal("))).Count
if ($internalCalls -lt 6) {
    Write-Host "X only $internalCalls call(s) to create_audit_log_internal - expected 5 triggers + the public wrapper" -ForegroundColor Red; exit 1
}
Write-Host "+ every audit path routes through the non-authorising logger ($internalCalls call sites)" -ForegroundColor Green

# --- the internal logger must NOT authorise ---------------------------------
$internalBody = [regex]::Match($m, "FUNCTION public\.create_audit_log_internal(.|\n)*?\`$function\`$;").Value
if ($internalBody -match "assert_company_access") {
    Write-Host "X create_audit_log_internal still asserts company access - the 836 defect returns" -ForegroundColor Red; exit 1
}
if ($internalBody -notmatch [regex]::Escape("INSERT INTO audit_logs")) {
    Write-Host "X create_audit_log_internal does not actually write the audit row" -ForegroundColor Red; exit 1
}
Write-Host "+ the internal logger records without authorising" -ForegroundColor Green

# --- but the PUBLIC one still must, or audit rows could be forged -------------
if ($m -notmatch [regex]::Escape("PERFORM public.assert_company_access(p_company_id);")) {
    Write-Host "X the public create_audit_log no longer asserts - audit rows could be forged" -ForegroundColor Red; exit 1
}
Write-Host "+ the public RPC still asserts, so audit rows cannot be forged" -ForegroundColor Green

# --- every trigger handles BOTH classes -------------------------------------
$qc = ([regex]::Matches($m, "WHEN query_canceled THEN")).Count
$wo = ([regex]::Matches($m, "WHEN OTHERS THEN")).Count
if ($qc -lt 5) { Write-Host "X only $qc handler(s) for query_canceled - expected 5" -ForegroundColor Red; exit 1 }
if ($wo -lt 5) { Write-Host "X only $wo handler(s) for OTHERS - expected 5" -ForegroundColor Red; exit 1 }
Write-Host "+ $qc query_canceled and $wo OTHERS handlers - all five paths covered" -ForegroundColor Green

# --- the three previously unprotected functions are named -------------------
foreach ($fn in @("audit_customer_changes", "audit_price_changes", "audit_status_changes",
                  "audit_trigger_function", "audit_journal_entry_lines_func")) {
    if ($m -notmatch [regex]::Escape("FUNCTION public.$fn()")) {
        Write-Host "X $fn is not in the migration - it stays able to abort a business write" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all five trigger functions are rewritten, including the three that had no handler" -ForegroundColor Green

# --- the guard itself must strip comments, or it will repeat my mistake -------
$g = Get-Content -LiteralPath $grd -Raw
if ($g -notmatch [regex]::Escape('replace(/--[^\n]*/g, "")')) {
    Write-Host "X the guard does not strip comments - it would flag the explanation as the defect" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("prorettype = 'trigger'::regtype")) {
    Write-Host "X the guard does not enumerate trigger functions from the live DB" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard reads the live database and strips comments before judging" -ForegroundColor Green

if ((Get-Content -LiteralPath "package.json" -Raw) -notmatch [regex]::Escape("check:audit-safe")) {
    Write-Host "X the guard is not wired into package.json" -ForegroundColor Red; exit 1
}
if ((Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw) -notmatch [regex]::Escape("check:audit-safe")) {
    Write-Host "X the guard is not in CI - it would only ever run here" -ForegroundColor Red; exit 1
}
Write-Host "+ wired into package.json and CI" -ForegroundColor Green

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the audit trail can still abort operations" -ForegroundColor Red; exit 1 }

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
if (Test-Path "scripts/check-service-role-scoping.js") {
    node scripts/check-service-role-scoping.js
    if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping check failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the migration files match the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence - NOT pushing" -ForegroundColor Red; exit 1 }

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
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$stagedMig = (git show ":$mig" 2>$null | Out-String)
if (-not $stagedMig.Contains("create_audit_log_internal")) {
    Write-Host "X the staged migration is not the verified one" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged migration is the verified one" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_840.txt"
    $msgLines = @(
        'fix(audit): v3.74.840 - an audit log is a witness, not a judge',
        '',
        'Follow-on from 836. That release fixed the immediate cause - the',
        'membership check did not recognise a company owner. This one fixes the',
        'structural cause: how an audit log was able to kill a signup at all.',
        '',
        'THREE gaps, each sufficient on its own.',
        '',
        '1. The logger authorised instead of recording. create_audit_log opens with',
        '   a membership assertion. But a trigger fires AFTER RLS has already',
        '   permitted the write, so authorisation happened upstream. A second check',
        '   there adds no security - it can only ever refuse something that was',
        '   already allowed. Which is exactly what happened.',
        '',
        '2. The safety net had a hole shaped like the falling object. The trigger DID',
        '   have EXCEPTION WHEN OTHERS, and it died anyway, because WHEN OTHERS in',
        '   PL/pgSQL does not trap query_canceled (57014) - and 57014 is precisely',
        '   the code the authorisation check raises ON PURPOSE so callers cannot',
        '   swallow it. Two individually sound decisions produced a catastrophe',
        '   together.',
        '',
        '3. Worst, and found while investigating: three of the five audit trigger',
        '   functions had NO exception handler at all.',
        '',
        '     audit_customer_changes  -> customers',
        '     audit_price_changes     -> products',
        '     audit_status_changes    -> bills, invoices, purchase_orders',
        '',
        '   So ANY hiccup in audit writing - not just 57014 - would abort creating a',
        '   customer, changing a price, or changing the status of an invoice. The',
        '   five most central tables in the system.',
        '',
        'The fix: create_audit_log_internal records without authorising, with EXECUTE',
        'revoked from anon and authenticated so only internal triggers reach it. The',
        'public create_audit_log keeps its assertion and delegates, so a direct RPC',
        'still cannot forge an audit row against another company - the check now sits',
        'where it belongs rather than in the path of every write. All five trigger',
        'functions call the internal logger and handle BOTH query_canceled and',
        'OTHERS.',
        '',
        'Verified by deliberate sabotage on the test database: the logger was',
        'replaced with one that raises the exact killing code, 57014, and a customer',
        'was inserted. INSERT SURVIVED. Before the fix the same condition killed the',
        'operation.',
        '',
        'scripts/check-audit-cannot-abort.js reads the LIVE database and asserts all',
        'four properties: every trigger function calls the internal logger, every one',
        'handles both classes, the internal logger does not authorise, and the public',
        'one still does. It strips comments before matching, because the comments in',
        'these functions name the authorisation check in order to explain why it is',
        'absent - a guard forbidding the string would forbid the explanation. That',
        'trap has now caught this project eight times, including once in my own',
        'verification query an hour ago.',
        '',
        'Lesson worth keeping: two checks that are each sound can fight. And WHERE a',
        'check sits is part of whether it is correct - a guard in the path of every',
        'write becomes a single point of failure for everything.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.840 pushed - the audit trail can no longer veto what it records" -ForegroundColor Green
}
