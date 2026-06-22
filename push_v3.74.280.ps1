$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.279.ps1") { Remove-Item -LiteralPath "push_v3.74.279.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.280"') {
    Write-Host "+ 3.74.280" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$cli = Get-Content -LiteralPath "lib/supabase/client.ts" -Raw
if ($cli -notmatch "flowType: 'implicit'") {
    Write-Host "X supabase client missing flowType: implicit" -ForegroundColor Red; exit 1
}
Write-Host "+ supabase client uses implicit flow (cross-device password reset)" -ForegroundColor Green

$fcp = Get-Content -LiteralPath "app/auth/force-change-password/page.tsx" -Raw
foreach ($c in @(
    'setSession',
    'access_token',
    'refresh_token',
    'exchangeCodeForSession',
    'الرابط ده ابتدأ من جهاز تانى'
)) {
    if ($fcp -notmatch [regex]::Escape($c)) { Write-Host "X force-change-password missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ force-change-password handles both hash-token (implicit) and ?code= (PKCE legacy)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_280.txt"
    $msgLines = @(
        'fix(auth): v3.74.280 - password reset works cross-device (laptop -> phone)',
        '',
        'After v3.74.279, the user clicked "نسيت كلمة المرور" on their laptop,',
        'received the email, opened it on their phone, and saw a red error:',
        '"PKCE code verifier not found in storage. This can happen if the',
        'auth flow was initiated in a different browser or device..."',
        '',
        'Root cause: Supabase clients default to PKCE flow, which saves a',
        'code_verifier in localStorage on the originating device. When the',
        'recovery link is opened on a different device/browser, that',
        'verifier is unreachable and the exchange fails.',
        '',
        'Fix has two parts:',
        '',
        '  lib/supabase/client.ts',
        '    - Switch the browser client to implicit flow:',
        '        auth: {',
        '          flowType: "implicit",',
        '          detectSessionInUrl: true,',
        '          autoRefreshToken: true,',
        '          persistSession: true,',
        '        }',
        '      Recovery and magic-link emails now embed the tokens directly',
        '      in the URL hash (#access_token=...&refresh_token=...). Any',
        '      device that opens the link can establish the session from',
        '      the hash alone, no cross-device state required.',
        '',
        '  app/auth/force-change-password/page.tsx',
        '    - Read tokens from the URL hash and pass them to',
        '      supabase.auth.setSession({ access_token, refresh_token }).',
        '    - Wipe the hash via history.replaceState so a refresh does not',
        '      replay it.',
        '    - Keeps the PKCE ?code= fallback for any in-flight emails',
        '      that pre-date this release.',
        '    - New Arabic error message for PKCE-style failures: "الرابط',
        '      ده ابتدأ من جهاز تانى. اطلب رابط جديد واضغطه من نفس الجهاز',
        '      اللى طلبت منه."',
        '',
        'Security note: implicit flow is slightly less secure than PKCE',
        'because the access token transits through the URL fragment. For',
        'this app the trade-off is worth it: real users on phones need',
        'password reset to work, and the cookie hardening / session',
        'rotation Supabase already does covers most of the gap.',
        '',
        'Files',
        '  lib/supabase/client.ts',
        '  app/auth/force-change-password/page.tsx',
        '  lib/version.ts -> 3.74.280'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.280 pushed" -ForegroundColor Green
}
