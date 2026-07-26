$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.838.ps1") { Remove-Item -LiteralPath "push_v3.74.838.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.839"') {
    Write-Host "+ 3.74.839" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.839]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.839]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$page = "app/auth/sign-up-success/page.tsx"
$mig  = "supabase/migrations/20260726000007_v3_74_838_auth_email_state.sql"
$gone = "app/api/auth/email-state/route.ts"
$files = @("lib/version.ts", "CHANGELOG.md", $page, $mig,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.839.ps1")
git add -- $files 2>&1 | Out-Null
git add -A -- "app/api/auth" 2>&1 | Out-Null
git add -u -- "push_v3.74.838.ps1" 2>$null

# ── the offending route must be GONE, not exempted ───────────────────────────
if (Test-Path $gone) {
    Write-Host "X the service-role route still exists on disk" -ForegroundColor Red; exit 1
}
$stillTracked = git ls-files -- $gone
if ($stillTracked) {
    Write-Host "X the service-role route is still tracked by git - stage its deletion" -ForegroundColor Red; exit 1
}
Write-Host "+ the unauthenticated service-role route is gone, not exempted" -ForegroundColor Green

# it must not have been silently added to any exemption list either
$exemptHits = git grep -l "email-state" -- scripts/ 2>$null
if ($exemptHits) {
    Write-Host "X email-state appears in a guard script - it looks exempted rather than removed:" -ForegroundColor Red
    Write-Host "  $exemptHits" -ForegroundColor Red
    exit 1
}
Write-Host "+ it was not added to any exemption list" -ForegroundColor Green

$p = Get-Content -LiteralPath $page -Raw
$m = Get-Content -LiteralPath $mig -Raw

# --- the page calls the RPC directly, with the anon client --------------------
if ($p -notmatch [regex]::Escape('supabase.rpc("auth_email_state", { p_email: email })')) {
    Write-Host "X the page does not call the RPC directly" -ForegroundColor Red; exit 1
}
# Anchor on a real CALL, not on the path appearing anywhere: the JSDoc above
# fetchEmailState names the deleted route on purpose, to record why it went. A
# guard that forbids the string forbids the explanation too - the comment trap
# this project has now hit seven times. What must not exist is a fetch to it.
if ($p -match 'fetch\(\s*"[^"]*api/auth/email-state') {
    Write-Host "X the page still FETCHES the deleted route" -ForegroundColor Red; exit 1
}
Write-Host "+ the page calls the function directly with the anon key" -ForegroundColor Green

# --- the rate limit now lives INSIDE the function ----------------------------
if ($m -notmatch [regex]::Escape("v_limit := public.check_and_increment_rate_limit('ip:' || v_ip, 'auth_email_state', 8, 60);")) {
    Write-Host "X the rate limit is not inside the function - it could be bypassed" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("current_setting('request.headers', true)")) {
    Write-Host "X the function does not read the caller IP - the limit would be global" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("RETURN 'unknown';")) {
    Write-Host "X exceeding the limit does not fall back to 'unknown'" -ForegroundColor Red; exit 1
}
Write-Host "+ the rate limit is inside the function, per caller IP" -ForegroundColor Green

# --- and it is callable by the browser, but still leaks only one bit ---------
if ($m -notmatch [regex]::Escape("GRANT EXECUTE ON FUNCTION public.auth_email_state(text) TO anon, authenticated, service_role")) {
    Write-Host "X anon cannot execute the function - the screen would always say 'unknown'" -ForegroundColor Red; exit 1
}
if ($m -match [regex]::Escape("'not_found'")) {
    Write-Host "X a missing email is distinguishable - full user enumeration" -ForegroundColor Red; exit 1
}
Write-Host "+ anon may call it, and a missing email still looks unconfirmed" -ForegroundColor Green

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
if (Test-Path "scripts/check-service-role-scoping.js") {
    node scripts/check-service-role-scoping.js
    if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping check failed" -ForegroundColor Red; exit 1 }
} else {
    Write-Host "! scripts/check-service-role-scoping.js not found locally (CI-only)" -ForegroundColor Yellow
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
git add -A -- "app/api/auth" 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if ($staged -notcontains $gone) {
    Write-Host "X the route's DELETION is not staged - CI would fail again" -ForegroundColor Red; exit 1
}
Write-Host "+ the route's deletion is staged" -ForegroundColor Green

$stagedMig = (git show ":$mig" 2>$null | Out-String)
if (-not $stagedMig.Contains("check_and_increment_rate_limit('ip:' || v_ip")) {
    Write-Host "X the staged migration is not the corrected one" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged migration carries the in-function rate limit" -ForegroundColor Green

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_839.txt"
    $msgLines = @(
        'fix(security): v3.74.839 - remove the need for a service-role key in a',
        'public route rather than exempting it',
        '',
        'CI stopped 838 with an entirely correct finding:',
        '',
        '  1 NEW route uses full database rights without scoping to the caller',
        '  auth/email-state/route.ts - builds a service-role client with no',
        '  authentication of any kind',
        '',
        'The guard is right. The route I wrote carried the service-role key - full',
        'rights over the whole database - with no authentication at all, because on',
        'the sign-up screen the user has not signed in yet. Its use was innocent:',
        'it read a single bit about one email address. But a public route holding',
        'full rights is a standing hazard regardless of what it does today; one',
        'later edit turns it into a doorway onto every company data.',
        '',
        'So it was not exempted. The need for it was removed.',
        '',
        'The rate limit moved INSIDE the database function, which reads the caller',
        'IP from request.headers, and EXECUTE was granted to anon. The function is',
        'now called straight from the browser with the anon key and the server route',
        'was deleted outright.',
        '',
        'That is better than an exemption, not merely equivalent:',
        '',
        '  - no service-role key in a public route at all',
        '  - the limit can no longer be bypassed. A limit enforced by the caller is',
        '    only as good as the caller; calling the function directly went around',
        '    it. Inside the function it is part of the thing being protected.',
        '',
        'Verified on the test database: 8 calls allowed, the 9th and 10th return',
        'unknown. On production the real customer address returns confirmed and an',
        'address that does not exist returns pending - a missing address is still',
        'indistinguishable from an unconfirmed one, so only confirmed accounts are',
        'exposed rather than existence in general.',
        '',
        'Lesson worth keeping: a guard that stops you is not an obstacle to be',
        'exempted, it is a question that deserves an answer. A documented exemption',
        'silences the guard and keeps the hazard; removing the need ends it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.839 pushed - no full-rights key in a public route" -ForegroundColor Green
}
