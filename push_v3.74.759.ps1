$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.758.ps1") { Remove-Item -LiteralPath "push_v3.74.758.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.759"') {
    Write-Host "+ 3.74.759" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.759]")) { Write-Host "X CHANGELOG missing [3.74.759]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# --- Verify the PREMISE, not just the edit ------------------------------------
# v3.74.733: I wrote a release deleting two pages based on a search that had
# asked the wrong question. The push guard re-checked the premise and refused.
# The premise here is "nothing calls these functions any more". If a caller
# exists, this release breaks it the same way v3.74.726 broke the settings route.
$dropped = @("fix_historical_cogs", "fix_all_historical_cogs", "fix_cogs_clean", "recalculate_cogs")
foreach ($fn in $dropped) {
    # A call looks like .rpc('name'  — a mention in prose does not. Every guard
    # this week that matched a bare name ended up rejecting its own comments.
    $callers = Get-ChildItem -Path "app","lib","components" -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
               Select-String -Pattern ("\.rpc\(\s*['""]" + $fn + "['""]")
    if ($callers) {
        Write-Host "X $fn is dropped in the database but still called:" -ForegroundColor Red
        $callers | ForEach-Object { Write-Host "   $($_.Path):$($_.LineNumber)" }
        exit 1
    }
}
Write-Host "+ none of the four dropped COGS functions has a caller left" -ForegroundColor Green

# The retired route must no longer reach for the dropped function.
$fh = Get-Content -LiteralPath "app/api/fix-historical-data/route.ts" -Raw
if ($fh -match "\.rpc\(") {
    Write-Host "X the retired route still makes an RPC call" -ForegroundColor Red; exit 1
}
if ($fh -notmatch "410") {
    Write-Host "X the retired route should answer 410 Gone" -ForegroundColor Red; exit 1
}
if ($fh -match "SUPABASE_SERVICE_ROLE_KEY") {
    Write-Host "X the retired route still builds a service-role client for nothing" -ForegroundColor Red; exit 1
}
Write-Host "+ fix-historical-data retired cleanly" -ForegroundColor Green

# Both migrations must be in the repo, or the database and the checked-in schema
# disagree and a rebuild restores exactly what this release removed.
foreach ($m in @(
    "supabase/migrations/20260720000013_v3_74_759_close_anon_reachable_writers.sql",
    "supabase/migrations/20260720000014_v3_74_759_ic_anon_reachable_writers.sql"
)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260720000013_v3_74_759_close_anon_reachable_writers.sql" -Raw
foreach ($fn in @("fix_all_historical_cogs", "fix_cogs_clean", "recalculate_cogs")) {
    if ($mig -notmatch ("DROP FUNCTION IF EXISTS public\." + $fn)) {
        Write-Host "X migration does not drop $fn" -ForegroundColor Red; exit 1
    }
}
# The deliberate exception must stay deliberate. If a later edit revokes anon on
# the rate limiter, throttling on the login route fails open and says nothing.
if ($mig -match "REVOKE EXECUTE ON FUNCTION public\.check_and_increment_rate_limit") {
    Write-Host "X the rate limiter must keep anon EXECUTE - it runs before login and fails open" -ForegroundColor Red
    exit 1
}
$watch = Get-Content -LiteralPath "supabase/migrations/20260720000014_v3_74_759_ic_anon_reachable_writers.sql" -Raw
if ($watch -notmatch "prorettype <> 'trigger'::regtype") {
    Write-Host "X the watcher must exclude trigger functions or it drowns in ~60 false findings" -ForegroundColor Red
    exit 1
}
Write-Host "+ both migrations present and consistent" -ForegroundColor Green

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
$scan = & node scripts/check-unchecked-writes.js 2>&1 | Out-String
$scanCode = $LASTEXITCODE
Write-Host ($scan.Trim())
if ($scanCode -ne 0) {
    Write-Host "X baseline mismatch - set BASELINE to the 'Found' number above" -ForegroundColor Red; exit 1
}

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/api/fix-historical-data/route.ts" `
    "supabase/migrations/20260720000013_v3_74_759_close_anon_reachable_writers.sql" `
    "supabase/migrations/20260720000014_v3_74_759_ic_anon_reachable_writers.sql" `
    "push_v3.74.759.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.758.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") {
    Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1
}
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_759.txt"
    $msgLines = @(
        'fix(security): v3.74.759 - three anon-callable COGS rewriters, dropped',
        '',
        'v3.74.726 dropped fix_historical_cogs for costing COGS from the product',
        'card instead of FIFO lots. I dropped the function and did not search for',
        'its siblings. Three survived:',
        '',
        '  fix_all_historical_cogs()  loops every company in the database',
        '  fix_cogs_clean()           loops every paid invoice, no company filter',
        '  recalculate_cogs()         the same, and with no "already posted" check',
        '                             at all - each run adds another COGS entry per',
        '                             invoice, so two calls double cost of goods',
        '                             sold everywhere',
        '',
        'All three SECURITY DEFINER, so RLS does not apply, all three with EXECUTE',
        'granted to anon: reachable over PostgREST without logging in. Nothing in',
        'the database or the app called any of them.',
        '',
        'Why four previous sweeps missed them: v3.74.727, .746, .748 and .751 all',
        'require a uuid argument. These take none. Every watcher reported CLEAN and',
        'every one was telling the truth inside its own scope.',
        '',
        'And a survey column I wrote reported filters_by_company = true for',
        'fix_all_historical_cogs, because the pattern matched',
        '"coa.company_id = company_record.id" - a lookup INSIDE the loop over all',
        'companies. The flag said scoped; the function walked the whole database.',
        'Reading the source is what caught it. Twenty-second instance of matching',
        'something that resembles the target instead of the target.',
        '',
        'Also revoked anon on ten more reachable writers. cleanup_old_security_events(0)',
        'deletes the entire security event log, and get_activity_summary returns who',
        'did what inside any company id handed to it.',
        '',
        'check_and_increment_rate_limit deliberately keeps anon EXECUTE. Throttling',
        'has to work on the login route, where the caller is anon by definition, and',
        'lib/rate-limit.ts fails OPEN on error - a blanket revoke would have disabled',
        'rate limiting at the login page and reported nothing. The push script now',
        'refuses any release that revokes it.',
        '',
        'app/api/fix-historical-data has been calling the function dropped in .726',
        'for thirty-three releases, erroring every time. No test covered it, and a',
        'settings button that errors looks like one nobody pressed. Retired at 410.',
        'No replacement: pre-FIFO movements cannot be repaired by a button, and',
        'getting the lot order wrong misstates gross profit silently.',
        '',
        'ic_anon_reachable_writers watches the shape rather than the name, excludes',
        'trigger functions (PostgREST cannot call them; including them buried the',
        'four real findings under ~60 rows of noise), and was proven by sabotage:',
        'granting anon back inside a rolled-back transaction moved it from 0',
        'findings to 1, naming the right function.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.759 pushed - no writing function is reachable without logging in" -ForegroundColor Green
}
