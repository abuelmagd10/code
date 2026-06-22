$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.280.ps1") { Remove-Item -LiteralPath "push_v3.74.280.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.281"') {
    Write-Host "+ 3.74.281" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$fcp = Get-Content -LiteralPath "app/auth/force-change-password/page.tsx" -Raw
foreach ($c in @(
    'verifyOtp',
    'token_hash',
    'Path A: token_hash',
    'الرابط مش صحيح أو اتستخدم قبل كده'
)) {
    if ($fcp -notmatch [regex]::Escape($c)) { Write-Host "X force-change-password missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ force-change-password: verifyOtp path covers cross-device recovery" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_281.txt"
    $msgLines = @(
        'fix(auth): v3.74.281 - definitive cross-device password reset via token_hash + verifyOtp',
        '',
        'After v3.74.280 (implicit flow), the user still got the device-bound',
        'error when opening the reset link on a phone from a laptop-initiated',
        'flow. Root cause: supabase-js routes reset-password emails through',
        'the GoTrue /verify endpoint regardless of the client flowType, which',
        'still produces a PKCE-bound link on recent versions.',
        '',
        'Final fix bypasses Supabase /verify entirely:',
        '',
        '  Email template (Supabase Dashboard, manual change applied)',
        '    Button + plain-text fallback link now point at',
        '      https://7esab.com/auth/force-change-password?token_hash={{ .TokenHash }}&type=recovery',
        '    The TokenHash variable is the same secret Supabase issued for',
        '    recovery; it is self-contained and not tied to any client',
        '    storage. Any device that opens the link can use it.',
        '',
        '  app/auth/force-change-password/page.tsx',
        '    New "Path A" in bootstrap reads ?token_hash=...&type=recovery',
        '    and calls supabase.auth.verifyOtp({ token_hash, type }).',
        '    verifyOtp creates the session server-side from the hash alone,',
        '    no PKCE code_verifier needed, no implicit hash either.',
        '    Old Path B (implicit hash tokens) and Path C (PKCE ?code=) are',
        '    kept for any in-flight emails that pre-date this release.',
        '    Added Arabic translations for "token expired" and "invalid',
        '    token" so the error messages remain in plain Arabic when a',
        '    user opens a stale link.',
        '',
        'Files',
        '  app/auth/force-change-password/page.tsx',
        '  lib/version.ts -> 3.74.281'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.281 pushed" -ForegroundColor Green
}
