$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.855.ps1") { Remove-Item -LiteralPath "push_v3.74.855.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.856"') {
    Write-Host "+ 3.74.856" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.856]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.856]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$cb  = "app/auth/callback/page.tsx"
$onb = "app/onboarding/page.tsx"
$mw  = "lib/supabase/middleware.ts"
$chk = "scripts/check-users-without-company.js"

$files = @("lib/version.ts", "CHANGELOG.md", $cb, $onb, $mw, $chk,
           "package.json", ".github/workflows/ci.yml",
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.856.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.855.ps1" 2>$null

$c = Get-Content -LiteralPath $cb  -Raw
$o = Get-Content -LiteralPath $onb -Raw
$m = Get-Content -LiteralPath $mw  -Raw

# ── 1. the backup must survive until the company exists ────────────────────
# pending_companies was deleted the moment it was read, and the company is
# created dozens of lines later. Any stumble in between left a real customer
# with no company AND no backup to retry from - which is exactly what happened.
# ⚠️ The position must be that of the DELETE, not of any mention of the table.
# The first attempt searched for `from('pending_companies')` followed by a
# newline - and matched the READ near the top of the function, which is before
# the insert by design. The check then failed on correct code. Two traps in one
# line: a substring that is not specific enough, and [regex]::Match(...).Index
# returning 0 rather than -1 when nothing matches, which reads as "position 0".
$createAt = $c.IndexOf(".from('companies')")
$deleteMatch = [regex]::Match($c, "from\('pending_companies'\)\s*\r?\n\s*\.delete\(\)")
if ($createAt -lt 0 -or -not $deleteMatch.Success) {
    Write-Host "X could not locate both the company insert and the pending delete - check would pass blindly" -ForegroundColor Red
    exit 1
}
$deleteAt = $deleteMatch.Index
if ($deleteAt -lt $createAt) {
    Write-Host "X the pending-company backup is still deleted BEFORE the company is created" -ForegroundColor Red
    Write-Host "  A failure in between loses the customer's company name for good." -ForegroundColor Red
    exit 1
}
Write-Host "+ the signup backup is only cleared after the company exists" -ForegroundColor Green

# ── 2. the first screen can no longer hang forever ─────────────────────────
# checkAuth had no try/catch and no timeout, so a rejected promise never
# reached setCheckingAuth(false) and the spinner ran for ever - no message, no
# retry, no way out. That is the screenshot the owner was sent.
foreach ($need in @("finally", "TIMEOUT", "setAuthError", "setRetryToken")) {
    if ($o -notmatch [regex]::Escape($need)) {
        Write-Host "X onboarding is missing '$need' - it can still hang on the first screen" -ForegroundColor Red
        exit 1
    }
}
if ($o -notmatch [regex]::Escape("إعادة المحاولة")) {
    Write-Host "X there is no retry button - the customer would face a dead screen" -ForegroundColor Red; exit 1
}
Write-Host "+ onboarding always stops loading, and offers a way forward" -ForegroundColor Green

# ── 3. nobody is left with an account and nowhere to go ────────────────────
# has_company was already computed by the middleware RPC and thrown away.
if ($m -notmatch [regex]::Escape("has_company === false")) {
    Write-Host "X a user with no company is still not redirected to onboarding" -ForegroundColor Red; exit 1
}
# ...but pages only. Redirecting /api/* would answer JSON callers with HTML,
# a worse fault than the one being fixed and far harder to diagnose.
if ($m -notmatch [regex]::Escape("isApiRequest")) {
    Write-Host "X API requests are not excluded from the onboarding redirect" -ForegroundColor Red; exit 1
}
# and /onboarding itself must stay exempt from the check, or it loops for ever
if ($m -notmatch [regex]::Escape("!isOnboarding")) {
    Write-Host "X /onboarding is not exempt - the redirect would loop endlessly" -ForegroundColor Red; exit 1
}
Write-Host "+ stranded users are sent to onboarding - pages only, no loop" -ForegroundColor Green

# ── 4. and a standing check, because this defect is never reported ─────────
# The customer sees no error, the system logs nothing, and the owner only finds
# out if the customer phones him.
if ($chk -and -not (Test-Path $chk)) {
    Write-Host "X the standing check is missing" -ForegroundColor Red; exit 1
}
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
git add -u -- "push_v3.74.855.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_856.txt"
    $msgLines = @(
        'fix(onboarding): v3.74.856 - the first screen a customer sees had no way out',
        '',
        'A real customer signing up as "Grace Town Contracting" reported the screen',
        'stuck on "Loading..." after signing in. His account exists, his email is',
        'confirmed, his sign-in worked - and he has no company at all.',
        '',
        'The owner asked the question that found it: how can a user have no company',
        'when the company was entered during signup?',
        '',
        'Because the company is NOT created at signup. Signing up only stores the',
        'name. The company - with its branch, warehouse, cost centre and 95 accounts',
        '- is created later, when the 6-digit confirmation code is entered, in',
        '/auth/callback.',
        '',
        'And there, the pending_companies backup row was deleted the moment it was',
        'READ, while the company is created dozens of lines further down. Any',
        'stumble in between - a dropped connection, a timeout, a failure creating',
        'the branch or the chart of accounts - leaves the customer with no company',
        'AND no backup to retry from. Production confirms exactly that shape: his',
        'backup row is gone and his company was never created, so his company name,',
        'currency and language were lost together.',
        '',
        'Never destroy the source before the thing that depends on it has succeeded.',
        'The delete now runs only after the company exists.',
        '',
        'The screen itself then hung for ever. checkAuth had no try/catch and no',
        'timeout, so a rejected promise never reached setCheckingAuth(false): the',
        'spinner ran on with no message, no retry and no exit. A failure that',
        'produces silence is worse than one that shouts.',
        '',
        'Four fixes, each of which prevents the recurrence on its own:',
        '',
        '  1. the backup is cleared only after the company is created',
        '  2. try/catch + finally + a 12s timeout - loading always ends',
        '  3. an error message with "try again" and "back to sign in"',
        '  4. middleware sends any user with has_company=false to /onboarding',
        '',
        'The fourth is the real guarantee. has_company was ALREADY computed by the',
        'middleware RPC and thrown away. Now, whatever goes wrong in signup in',
        'future and for whatever reason, the customer ends up on a screen where he',
        'can act rather than at a dead end. Pages only: /api/* is excluded, because',
        'answering a JSON caller with an HTML redirect is a worse fault than the one',
        'being fixed, and much harder to diagnose. /onboarding stays exempt from the',
        'check or the redirect would loop.',
        '',
        'Finally a standing check, because this defect is never reported: the',
        'customer sees no error, the system logs nothing, and the owner only learns',
        'of it if the customer telephones him. check-users-without-company.js asks',
        'the database directly whether any confirmed account has no company, with an',
        'hour of grace for someone mid-setup. It immediately surfaced a second case',
        'nobody knew about, from 7 November 2025.',
        '',
        'His company was deliberately NOT created by hand. Creating one properly',
        'means a branch, a warehouse, a cost centre and 95 accounts; a half-built',
        'company is worse than none. He only needs to sign in again once this ships,',
        'and the system will build it correctly.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.856 pushed - no customer is left facing a dead screen" -ForegroundColor Green
}
