$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.278.ps1") { Remove-Item -LiteralPath "push_v3.74.278.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.279"') {
    Write-Host "+ 3.74.279" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$fcp = Get-Content -LiteralPath "app/auth/force-change-password/page.tsx" -Raw
foreach ($c in @(
    'exchangeCodeForSession',
    'translateAuthError',
    'sessionReady',
    'انتهت صلاحية رابط إعادة تعيين كلمة المرور',
    'جارٍ التحقق من الرابط',
    'الرجوع لصفحة الدخول'
)) {
    if ($fcp -notmatch [regex]::Escape($c)) { Write-Host "X force-change-password missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ force-change-password: exchanges PKCE code, waits for session, shows Arabic recovery message" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_279.txt"
    $msgLines = @(
        'fix(auth): v3.74.279 - force-change-password no longer fails with "Auth session missing!"',
        '',
        'User clicked the password-reset link from their email on mobile,',
        'landed on /auth/force-change-password, typed a new password +',
        'confirm, and got "Auth session missing!" in English red text.',
        '',
        'Root cause: the page called supabase.auth.updateUser() without',
        'first establishing the recovery session. Supabase /verify',
        'redirects to our page with a ?code=... parameter (PKCE flow),',
        'which has to be exchanged for a session before any auth method',
        'will work. We never did that, so the session was missing.',
        '',
        'Fix',
        '  app/auth/force-change-password/page.tsx (rewrite)',
        '    - New useEffect runs on mount and:',
        '        1. Reads ?code= from the URL.',
        '        2. Calls supabase.auth.exchangeCodeForSession(code).',
        '        3. Strips the code out of the URL via history.replaceState',
        '           so a page refresh does not try to replay it.',
        '        4. Calls getSession() and waits one tick if needed to',
        '           confirm the session is live.',
        '        5. Sets sessionReady so the form can be submitted.',
        '    - While the exchange is in flight the form is replaced by',
        '      "جارٍ التحقق من الرابط...".',
        '    - If the exchange fails (expired link, used twice, network)',
        '      the form is replaced by a red strip in plain Arabic:',
        '      "انتهت صلاحية رابط إعادة تعيين كلمة المرور. اطلب رابط',
        '      جديد من صفحة الدخول." with a button back to /auth/login.',
        '    - The Save button is disabled until sessionReady is true,',
        '      so a slow exchange cannot race the submit.',
        '    - translateAuthError() also covers weak-password and',
        '      same-as-old errors in Arabic.',
        '',
        'Files',
        '  app/auth/force-change-password/page.tsx',
        '  lib/version.ts -> 3.74.279'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.279 pushed" -ForegroundColor Green
}
