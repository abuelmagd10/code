$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.288.ps1") { Remove-Item -LiteralPath "push_v3.74.288.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.289"') {
    Write-Host "+ 3.74.289" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "app/api/reset-password-with-code/route.ts")) {
    Write-Host "X reset-password-with-code endpoint missing" -ForegroundColor Red; exit 1
}
$ep = Get-Content -LiteralPath "app/api/reset-password-with-code/route.ts" -Raw
foreach ($n in @('verifyOtp','updateUser','recovery','access_token')) {
    if ($ep -notmatch [regex]::Escape($n)) {
        Write-Host "X reset-password-with-code missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ reset-password-with-code endpoint in place" -ForegroundColor Green

$lp = Get-Content -LiteralPath "app/auth/login/page.tsx" -Raw
if ($lp -notmatch [regex]::Escape('/api/reset-password-with-code')) {
    Write-Host "X login page does not call /api/reset-password-with-code" -ForegroundColor Red; exit 1
}
Write-Host "+ login page routes verify through server endpoint" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_289.txt"
    $msgLines = @(
        'fix(auth): v3.74.289 - move verify+updatePassword to a server endpoint',
        '',
        'In v3.74.287 the client-side flow was:',
        '  await supabase.auth.verifyOtp({ email, token, type: "recovery" })',
        '  await supabase.auth.updateUser({ password })',
        '',
        'In testing the first call succeeded (Supabase auth logs showed',
        'POST /verify -> 200) but the second never reached the server. The',
        'browser error was "signal is aborted without reason" - the fetch',
        'for /user PUT was aborted in flight, somewhere between verifyOtp',
        'returning and updateUser kicking off. We could not pin down which',
        'auth listener / storage handler triggered the abort, and chasing',
        'it inside the supabase-js + React lifecycle felt brittle.',
        '',
        'Instead, do both calls server-side, in one HTTP round-trip:',
        '',
        '  POST /api/reset-password-with-code { email, code, password }',
        '    1. fresh non-persisting createClient(anon)',
        '    2. verifyOtp(email, code, type=recovery)',
        '    3. updateUser({ password })',
        '    4. return { access_token, refresh_token }',
        '',
        'The login page then calls setSession() with the returned tokens',
        'and proceeds through accept-membership + first-allowed-page as',
        'before. No React re-renders, no localStorage events, no shared',
        'mutable client between the two auth calls - eliminates the race.',
        '',
        'Files',
        '  app/api/reset-password-with-code/route.ts (NEW)',
        '  app/auth/login/page.tsx',
        '  lib/version.ts -> 3.74.289'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.289 pushed" -ForegroundColor Green
}
