$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.287.ps1") { Remove-Item -LiteralPath "push_v3.74.287.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.288"') {
    Write-Host "+ 3.74.288" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "app/api/check-email-registered/route.ts")) {
    Write-Host "X check-email-registered endpoint missing" -ForegroundColor Red; exit 1
}
$ep = Get-Content -LiteralPath "app/api/check-email-registered/route.ts" -Raw
foreach ($needle in @('listUsers','SUPABASE_SERVICE_ROLE_KEY','exists')) {
    if ($ep -notmatch [regex]::Escape($needle)) {
        Write-Host "X endpoint missing: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ check-email-registered endpoint in place" -ForegroundColor Green

$lp = Get-Content -LiteralPath "app/auth/login/page.tsx" -Raw
foreach ($needle in @('/api/check-email-registered','ما فيش حساب مسجّل')) {
    if ($lp -notmatch [regex]::Escape($needle)) {
        Write-Host "X login page missing: $needle" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ login page checks email registration first" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_288.txt"
    $msgLines = @(
        'feat(auth): v3.74.288 - tell the user when the email is not registered',
        '',
        'Supabase resetPasswordForEmail returns 200 OK regardless of whether',
        'the email is registered, as an anti-enumeration measure. The user',
        'who typed a wrong email then waited indefinitely for a code that was',
        'never going to arrive. We hit this in testing (abuelmagd31 instead',
        'of abuelmagd41).',
        '',
        'Add a small server-side endpoint that uses the service role to check',
        'whether the email exists in auth.users, and call it from the login',
        'page before kicking off the reset. On a hit we continue; on a miss',
        'we tell the user "no account is registered with this email" in',
        'plain Arabic and offer the sign-up link.',
        '',
        'The endpoint returns only a boolean - no user-shaped data leaks.',
        'Any internal error (env not set, lookup throws) returns exists:true',
        'so the original Supabase flow still runs - we never block a',
        'legitimate reset.',
        '',
        'For our SMB user base (identified accountants / business owners,',
        'not anonymous public) the small enumeration exposure is the right',
        'trade for a much clearer reset UX.',
        '',
        'Files',
        '  app/api/check-email-registered/route.ts (NEW)',
        '  app/auth/login/page.tsx',
        '  lib/version.ts -> 3.74.288'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.288 pushed" -ForegroundColor Green
}
