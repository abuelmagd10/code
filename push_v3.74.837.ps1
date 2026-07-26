$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.836.ps1") { Remove-Item -LiteralPath "push_v3.74.836.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.837"') {
    Write-Host "+ 3.74.837" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.837]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.837]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$page = "app/auth/sign-up-success/page.tsx"
$files = @("lib/version.ts", "CHANGELOG.md", $page, "docs/HANDOVER_2026-07-24.md", "push_v3.74.837.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.836.ps1" 2>$null

$p = Get-Content -LiteralPath $page -Raw

# --- the false success claim must be gone -------------------------------------
if ($p -match [regex]::Escape("✓ بعتنا كود جديد على بريدك. شوف الإيميل.")) {
    Write-Host "X the screen still claims a send that may never have happened" -ForegroundColor Red; exit 1
}
Write-Host "+ the false success claim is gone" -ForegroundColor Green

# --- and the honest message covers BOTH cases --------------------------------
if ($p -notmatch [regex]::Escape("لو بريدك غير مؤكَّد، وصلك كود جديد الآن")) {
    Write-Host "X the honest 'if not yet confirmed' half is missing" -ForegroundColor Red; exit 1
}
if ($p -notmatch [regex]::Escape("ولو حسابك مؤكَّد بالفعل فلن يُرسل كود")) {
    Write-Host "X the 'already confirmed' half is missing - the stuck user gets no way out" -ForegroundColor Red; exit 1
}
Write-Host "+ the message covers both cases honestly" -ForegroundColor Green

# --- it must NOT reveal whether the email exists ------------------------------
foreach ($leak in @("هذا البريد مسجَّل بالفعل", "البريد موجود", "already registered")) {
    if ($p -match [regex]::Escape($leak)) {
        Write-Host "X the message reveals whether the email exists (user enumeration): $leak" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ no user enumeration: existence is never confirmed" -ForegroundColor Green

# --- the expired-code message names the way out too --------------------------
if ($p -notmatch [regex]::Escape("ولو حسابك مؤكَّد بالفعل فلن يُرسل كود، استخدم «تسجيل الدخول» تحت")) {
    Write-Host "X the otp_expired message still only says 'ask for a new code'" -ForegroundColor Red; exit 1
}
if ($p -notmatch [regex]::Escape("otp_expired")) {
    Write-Host "X otp_expired is not matched - Supabase's own code would pass through untranslated" -ForegroundColor Red; exit 1
}
Write-Host "+ the expired-code message names the way out, and otp_expired is matched" -ForegroundColor Green

# --- the exit is a real button, not a grey link ------------------------------
if ($p -notmatch [regex]::Escape("عندى حساب مؤكَّد بالفعل — تسجيل الدخول")) {
    Write-Host "X the prominent sign-in exit is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ the sign-in exit is a button of its own" -ForegroundColor Green

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

$stagedBlob = (git show ":$page" 2>$null | Out-String)
if ([string]::IsNullOrWhiteSpace($stagedBlob) -or
    -not $stagedBlob.Contains("عندى حساب مؤكَّد بالفعل")) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_837.txt"
    $msgLines = @(
        'fix(auth): v3.74.837 - the verification screen announced a send that never',
        'happened',
        '',
        'Follow-on from 836, same customer. After his company creation failed he',
        'assumed the problem was the signup itself, started over, and asked for a',
        'new code. Nothing ever arrived.',
        '',
        'His auth record explains it:',
        '',
        '  account created      12:26:02',
        '  email CONFIRMED      12:26:42',
        '  company creation     failed 12:28 and 12:29  (the 836 defect)',
        '  confirmation_sent_at unchanged since 12:26:03',
        '  code he then typed   otp_expired',
        '',
        'So the first code did arrive and did work. His account was already',
        'confirmed - there was nothing left to confirm - and all he needed was to',
        'sign in.',
        '',
        'supabase.auth.resend({type:"signup"}) returns NO error for an',
        'already-confirmed account, and sends nothing either: Supabase',
        'deliberately avoids revealing whether the address exists. The screen',
        'nonetheless reported "we sent a new code to your inbox" in both cases, so',
        'it left a real customer waiting for mail that was never going to come.',
        '',
        'That did more damage than the original defect. The first failure at least',
        'told him something had gone wrong; this one told him something had',
        'succeeded when it had not.',
        '',
        'Per the owner decision, the message now covers both cases honestly - "if',
        'your address is not yet confirmed a new code has just been sent; if your',
        'account is already confirmed no code will be sent, use sign in" - without',
        'confirming whether the address exists, so it cannot be used to enumerate',
        'users. The otp_expired message names the same way out instead of only',
        'saying "ask for a new code", and matches Supabase own error code. The',
        'exit is now a button of its own rather than a small grey link that was',
        'the only way out.',
        '',
        'Lesson worth keeping: a false success message is worse than an error.',
        'An error makes people ask; a false success makes them wait.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.837 pushed - the screen no longer claims what it did not do" -ForegroundColor Green
}
