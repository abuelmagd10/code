$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.836.ps1", "push_v3.74.837.ps1")) {
    if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.838"') {
    Write-Host "+ 3.74.838" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($ver in @("[3.74.837]", "[3.74.838]")) {
    if ($cl -notmatch [regex]::Escape($ver)) {
        Write-Host "X CHANGELOG is missing a heading for $ver" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ CHANGELOG covers 837 and 838" -ForegroundColor Green

$page = "app/auth/sign-up-success/page.tsx"
$api  = "app/api/auth/email-state/route.ts"
$mig  = "supabase/migrations/20260726000007_v3_74_838_auth_email_state.sql"
$files = @("lib/version.ts", "CHANGELOG.md", $page, $api, $mig,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.838.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.836.ps1" "push_v3.74.837.ps1" 2>$null

$p = Get-Content -LiteralPath $page -Raw
$a = Get-Content -LiteralPath $api -Raw
$m = Get-Content -LiteralPath $mig -Raw

# --- the false success claim stays gone ---------------------------------------
if ($p -match [regex]::Escape("setResendMessage(`"✓ بعتنا كود جديد على بريدك. شوف الإيميل.`")")) {
    Write-Host "X the unconditional success claim is back" -ForegroundColor Red; exit 1
}
Write-Host "+ no unconditional success claim" -ForegroundColor Green

# --- the definite state is checked ON MOUNT, not only on resend --------------
if ($p -notmatch [regex]::Escape("if (!cancelled && state === `"confirmed`") setAlreadyConfirmed(true)")) {
    Write-Host "X the state is not checked when the screen opens - the user still waits first" -ForegroundColor Red; exit 1
}
if ($p -notmatch [regex]::Escape("{alreadyConfirmed && (")) {
    Write-Host "X the confirmed banner is not rendered above the form" -ForegroundColor Red; exit 1
}
Write-Host "+ the state is checked on open and shown above the form" -ForegroundColor Green

# --- a confirmed account must NOT trigger a pointless resend -----------------
if ($p -notmatch [regex]::Escape("if (state === `"confirmed`") {")) {
    Write-Host "X resend still fires for a confirmed account" -ForegroundColor Red; exit 1
}
Write-Host "+ resend is skipped for a confirmed account" -ForegroundColor Green

# --- both languages, and every visible string routed through T ---------------
foreach ($k in @("title:", "subtitle:", "emailLabel:", "codeLabel:", "spamHint:",
                 "submit:", "resend:", "backToLogin:", "alreadyConfirmed:")) {
    $count = ([regex]::Matches($p, [regex]::Escape($k))).Count
    if ($count -lt 2) {
        Write-Host "X '$k' is defined $count time(s) - it must exist in BOTH ar and en" -ForegroundColor Red; exit 1
    }
}
if ($p -notmatch [regex]::Escape('dir={lang === "en" ? "ltr" : "rtl"}')) {
    Write-Host "X the page direction does not follow the language" -ForegroundColor Red; exit 1
}
# any Arabic left hardcoded in JSX text nodes would defeat the point
if ($p -match ">\s*تأكيد البريد الإلكترونى\s*<") {
    Write-Host "X the title is still hardcoded Arabic in the markup" -ForegroundColor Red; exit 1
}
Write-Host "+ ar/en for every string, and direction follows the language" -ForegroundColor Green

# --- the enumeration limits must be real -------------------------------------
if ($a -notmatch [regex]::Escape("check_and_increment_rate_limit")) {
    Write-Host "X the endpoint has no rate limit - it could be used to scan email lists" -ForegroundColor Red; exit 1
}
if ($a -notmatch [regex]::Escape("{ state: `"unknown`" }, { status: 503 }")) {
    Write-Host "X a rate-limiter failure would open the door instead of closing it" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("REVOKE ALL ON FUNCTION public.auth_email_state(text) FROM anon")) {
    Write-Host "X anon can still call auth_email_state directly, bypassing the rate limit" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("GRANT EXECUTE ON FUNCTION public.auth_email_state(text) TO service_role")) {
    Write-Host "X service_role cannot execute the function - the endpoint would always return unknown" -ForegroundColor Red; exit 1
}
# it must NOT distinguish a missing email from an unconfirmed one
if ($m -match [regex]::Escape("'not_found'")) {
    Write-Host "X the function distinguishes a missing email - full user enumeration" -ForegroundColor Red; exit 1
}
Write-Host "+ rate-limited, service-role only, and a missing email looks like an unconfirmed one" -ForegroundColor Green

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

$stagedPage = (git show ":$page" 2>$null | Out-String)
if ([string]::IsNullOrWhiteSpace($stagedPage) -or -not $stagedPage.Contains("alreadyConfirmed")) {
    Write-Host "X the staged page is not the corrected one" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged page is the corrected one" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_838.txt"
    $msgLines = @(
        'fix(auth): v3.74.838 - tell the customer their actual state, in their own',
        'language',
        '',
        'Releases 837 and 838 together; 837 was never pushed.',
        '',
        '837 replaced a false success ("we sent a new code") with a message that was',
        'honest but deliberately vague: "if your address is not confirmed a code has',
        'been sent; if it is already confirmed no code will be sent". The owner',
        'reviewed that against the real case and asked for the definite version -',
        'and he was right: the customer spent twenty-five minutes pressing resend',
        'and never once opened the sign-in page. His last_sign_in_at did not move.',
        'A vague message did not get him out of the loop.',
        '',
        'Now the state is checked when the screen OPENS, not after a resend, so',
        'someone whose account is already confirmed learns it before they settle in',
        'to wait. A green banner sits above the form - "your account is already',
        'confirmed, you need no code, sign in and you will land on the',
        'create-company screen" - and the sign-in link becomes a primary button. A',
        'genuinely unconfirmed address gets a real "code sent" message, which is now',
        'true. If the state cannot be determined - rate limited, or no service key -',
        'the vague-but-honest 837 wording stands rather than a guess.',
        '',
        'Every string on the screen was hardcoded Arabic, so anyone who chose',
        'English at sign-up met Arabic on the most critical screen in the product.',
        'The screen is now fully ar/en with the page direction following the choice.',
        '',
        'The trade-off, stated plainly: for the system to assert the state it must',
        'check the address server-side, which makes it possible to learn that a',
        'given address is registered. Three limits keep that narrow: the function',
        'returns one bit - confirmed or pending - and a MISSING address is',
        'indistinguishable from an unconfirmed one, so only confirmed accounts are',
        'exposed rather than existence in general; the endpoint is rate limited to',
        '8/minute per IP and a limiter failure closes the door (503) rather than',
        'opening it; and EXECUTE is revoked from anon and authenticated so the',
        'function cannot be called from a browser at all - the endpoint is the only',
        'gate, and it is the one carrying the limit.',
        '',
        'The owner chose this after both options were put to him.',
        '',
        'Verified on production: the real customer address returns confirmed, an',
        'address that does not exist returns pending.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.838 pushed - the screen states the truth, in the reader's language" -ForegroundColor Green
}
