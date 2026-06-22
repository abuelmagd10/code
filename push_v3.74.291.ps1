$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.290.ps1") { Remove-Item -LiteralPath "push_v3.74.290.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.291"') {
    Write-Host "+ 3.74.291" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mw = Get-Content -LiteralPath "lib/supabase/middleware.ts" -Raw
foreach ($n in @('/api/verify-signup-with-code','/api/reset-password-with-code','/api/check-email-registered')) {
    if ($mw -notmatch [regex]::Escape($n)) {
        Write-Host "X middleware does not whitelist $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ middleware: auth API endpoints whitelisted as public" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_291.txt"
    $msgLines = @(
        'fix(auth): v3.74.291 - allow signup/reset/check-email API routes without a session',
        '',
        'The Phase-2 sign-up confirmation flow shipped in v3.74.290 returned',
        '"فشل التحقق" on every code submission. Vercel runtime logs showed:',
        '',
        '  POST /api/verify-signup-with-code  -> 307 Temporary Redirect',
        '',
        'The endpoint was never reached - middleware redirected the request',
        'to /auth/login before our route handler executed. Reason: a brand-',
        'new user signing up has no session yet, and updateSession() in',
        'lib/supabase/middleware.ts treats every /api/* path as private',
        'unless explicitly whitelisted in isPublicApi.',
        '',
        'Phase 1 (forgot-password) worked in testing only because the tester',
        'happened to be signed in from a previous session - the server-side',
        '/api/reset-password-with-code call was authed by accident.',
        '',
        'Whitelist the three auth-flow endpoints so they accept anonymous',
        'POSTs:',
        '  - /api/verify-signup-with-code',
        '  - /api/reset-password-with-code',
        '  - /api/check-email-registered',
        '',
        'They were already safe to expose: each one uses a fresh non-',
        'persisting client and only does the specific auth operation it',
        'is named after; nothing leaks more than the user has already',
        'been told (e.g. invalid code, invalid email).',
        '',
        'Files',
        '  lib/supabase/middleware.ts',
        '  lib/version.ts -> 3.74.291'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.291 pushed" -ForegroundColor Green
}
