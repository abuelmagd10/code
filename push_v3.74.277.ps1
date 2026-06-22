$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.276.ps1") { Remove-Item -LiteralPath "push_v3.74.276.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.277"') {
    Write-Host "+ 3.74.277" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$lg = Get-Content -LiteralPath "app/auth/login/page.tsx" -Raw
foreach ($c in @(
    'translateAuthError',
    'handleForgotPassword',
    'نسيت كلمة المرور',
    'البريد الإلكترونى أو كلمة المرور غير صحيحة',
    'resetPasswordForEmail',
    'بعتنا لك لينك إعادة تعيين كلمة المرور'
)) {
    if ($lg -notmatch [regex]::Escape($c)) { Write-Host "X login page missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ login page: Arabic error translation + Forgot Password inline flow" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_277.txt"
    $msgLines = @(
        'feat(auth): v3.74.277 - login page speaks Arabic + inline forgot-password',
        '',
        'Owner sent a screenshot of a real user (Notniche owner on mobile)',
        'who could not log in. The Supabase error "Invalid login credentials"',
        'was shown verbatim in English, and the page had no way to recover',
        'the password - only Sign in / Create account.',
        '',
        'Diagnostics confirmed the account exists, is email-confirmed, and',
        'has owner role on company notniche. So the failure was almost',
        'certainly a wrong password, but the user had no path forward.',
        '',
        'Changes',
        '  app/auth/login/page.tsx',
        '    - translateAuthError() maps the common Supabase auth errors',
        '      to plain Arabic:',
        '        invalid_credentials  -> "البريد الإلكترونى أو كلمة المرور',
        '                                 غير صحيحة. لو نسيت كلمة المرور..."',
        '        email_not_confirmed  -> "البريد لسه ما اتفعّلش..."',
        '        too_many_requests    -> "محاولات كتير، استنى دقيقة..."',
        '        user_not_found       -> "ما فيش حساب بهذا البريد..."',
        '      Everything else falls through to the original message.',
        '',
        '    - "نسيت كلمة المرور؟" link added below the password field.',
        '      Clicking it reads the email/username field and calls',
        '      supabase.auth.resetPasswordForEmail() with',
        '      redirectTo=/auth/force-change-password. If the field has',
        '      a username instead of an email, the user is told to type',
        '      the full email first. Success shows a green confirmation',
        '      strip so the user knows to check their inbox.',
        '',
        '  Nothing else changed - the existing handleLogin flow, the',
        '  username->email lookup, and the audit-log POST are intact.',
        '',
        'Files',
        '  app/auth/login/page.tsx',
        '  lib/version.ts -> 3.74.277'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.277 pushed" -ForegroundColor Green
}
