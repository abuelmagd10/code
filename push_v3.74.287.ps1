$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.285.ps1") { Remove-Item -LiteralPath "push_v3.74.285.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.287"') {
    Write-Host "+ 3.74.287" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# v3.74.286 — sidebar hide on auth-flow landing pages
$slp = Get-Content -LiteralPath "components/SidebarLayoutProvider.tsx" -Raw
foreach ($p in @('/auth/force-change-password','/invitations/accept')) {
    if ($slp -notmatch [regex]::Escape($p)) {
        Write-Host "X SidebarLayoutProvider missing $p" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ SidebarLayoutProvider: force-change-password + invitations/accept hide sidebar" -ForegroundColor Green

# v3.74.287 — login page 6-digit code flow
$lp = Get-Content -LiteralPath "app/auth/login/page.tsx" -Raw
foreach ($needle in @(
    "handleSendResetCode",
    "handleVerifyResetCode",
    "resetStage",
    "verifyOtp",
    "type: 'recovery'",
    "كود التحقق",
    'one-time-code'
)) {
    if ($lp -notmatch [regex]::Escape($needle)) {
        Write-Host "X login page missing: $needle" -ForegroundColor Red; exit 1
    }
}
if ($lp -match 'handleForgotPassword') {
    Write-Host "X login page still references handleForgotPassword (legacy link flow)" -ForegroundColor Red; exit 1
}
Write-Host "+ login page: 6-digit code flow wired" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_287.txt"
    $msgLines = @(
        'feat(auth): v3.74.287 - Forgot Password 6-digit code (+ v3.74.286 sidebar fix)',
        '',
        'Two related auth-UX fixes shipped together (286 was never deployed).',
        '',
        '== v3.74.286: hide app sidebar on auth-flow landing pages ==',
        '',
        'When a user clicked a password-reset / invite link on a browser where',
        'another company was previously signed in, the page rendered with the',
        'previous company sidebar visible alongside the auth form. After',
        'verifyOtp the auth session is replaced, but active_company_id in',
        'localStorage/cookie still points at the old tenant, so the sidebar',
        'showed the wrong menu.',
        '',
        'Fix: add /auth/force-change-password and /invitations/accept to',
        'PREFIX_HIDE_PATHS so neither route renders the sidebar.',
        '',
        '== v3.74.287: 6-digit code instead of a magic link for password reset ==',
        '',
        'Email scanners (Outlook Safe Links, anti-phishing services, corporate',
        'mail gateways) frequently follow links in inbound emails to inspect',
        'their destination. When a reset link includes a one-time token_hash,',
        'the scanner consumes the token before the human ever clicks; by the',
        'time the user opens the email and clicks, the token is already used',
        'and Supabase returns "Token has expired or is invalid". We hit this',
        'in testing: the user opened a reset link within 5 minutes of receipt',
        'and got "انتهت الصلاحية".',
        '',
        'Increasing OTP expiry does NOT fix this - the token is consumed, not',
        'expired. The only robust fix is to keep the secret off the URL entirely.',
        '',
        'New flow:',
        '  1. User clicks "نسيت كلمة المرور؟" on /auth/login',
        '  2. resetPasswordForEmail() is called without redirectTo - the email',
        '     template now shows a 6-digit code ({{ .Token }}) instead of a',
        '     hyperlink ({{ .TokenHash }}).',
        '  3. The login page transitions to a code+password form on the same',
        '     screen. No new route, no email click.',
        '  4. Submit calls verifyOtp({ email, token, type: "recovery" }) and',
        '     then updateUser({ password }). The accept-membership and',
        '     first-allowed-page calls run as before so the redirect targets',
        '     the right workspace.',
        '',
        'Because the secret is plain text inside the email body (not a URL),',
        'no scanner / link unfurler / preview service can consume it. Users',
        'type it themselves.',
        '',
        'Existing /auth/force-change-password route is left in place for old',
        'in-flight emails that still carry token_hash URLs. It will phase out',
        'after these emails expire.',
        '',
        'Next phases (separate PRs):',
        '  - v3.74.288: sign-up confirmation switches to 6-digit code',
        '  - v3.74.289: user invitation switches to 6-digit code',
        '',
        'Files',
        '  components/SidebarLayoutProvider.tsx',
        '  app/auth/login/page.tsx',
        '  lib/version.ts -> 3.74.287'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.287 pushed" -ForegroundColor Green
}
