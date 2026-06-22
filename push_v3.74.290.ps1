$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.289.ps1") { Remove-Item -LiteralPath "push_v3.74.289.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.290"') {
    Write-Host "+ 3.74.290" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "app/api/verify-signup-with-code/route.ts")) {
    Write-Host "X verify-signup-with-code endpoint missing" -ForegroundColor Red; exit 1
}
$ep = Get-Content -LiteralPath "app/api/verify-signup-with-code/route.ts" -Raw
foreach ($n in @('verifyOtp','type: "signup"','access_token')) {
    if ($ep -notmatch [regex]::Escape($n)) {
        Write-Host "X verify-signup-with-code missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ verify-signup-with-code endpoint in place" -ForegroundColor Green

$ssp = Get-Content -LiteralPath "app/auth/sign-up-success/page.tsx" -Raw
foreach ($n in @('/api/verify-signup-with-code','handleVerify','handleResend','one-time-code','setSession')) {
    if ($ssp -notmatch [regex]::Escape($n)) {
        Write-Host "X sign-up-success missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ sign-up-success: code-entry flow wired" -ForegroundColor Green

$sup = Get-Content -LiteralPath "app/auth/sign-up/page.tsx" -Raw
if ($sup -match '/api/resend-confirmation') {
    Write-Host "X sign-up still calls /api/resend-confirmation (should rely on Supabase template)" -ForegroundColor Red; exit 1
}
if ($sup -match 'emailRedirectTo\s*:') {
    Write-Host "X sign-up still passes emailRedirectTo: option (no link to click anymore)" -ForegroundColor Red; exit 1
}
Write-Host "+ sign-up: cleaned of legacy link flow" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_290.txt"
    $msgLines = @(
        'feat(auth): v3.74.290 - sign-up confirmation uses a 6-digit code',
        '',
        'Phase 2 of the migration off email links, applying the same pattern',
        'and the lessons we learned shipping v3.74.287-289 for forgot-password.',
        '',
        'Old flow:',
        '  sign-up form -> supabase.auth.signUp() -> Supabase confirmation',
        '  email with token_hash link + branded Resend email with same link',
        '  -> user clicks one of them -> /auth/callback verifies token_hash',
        '  -> createCompanyFromMetadata -> /dashboard.',
        '',
        'Problems we already documented for forgot-password apply here too:',
        '  - Outlook Safe Links / anti-phishing scanners consume the one-time',
        '    token_hash before the human clicks - "expired" on first try.',
        '  - Two duplicate emails (Supabase default + Resend) confused users.',
        '  - emailRedirectTo / link-click adds a moving piece for no benefit',
        '    once the user is already in the browser tab they just signed up',
        '    on.',
        '',
        'New flow:',
        '  sign-up form -> supabase.auth.signUp() (no emailRedirectTo, no',
        '    Resend call) -> Supabase emails the user a 6-digit {{ .Token }}',
        '    using the customized HTML template.',
        '  -> router push /auth/sign-up-success.',
        '  -> sign-up-success page is now a code-entry form, not a "check',
        '    your email" placeholder. User pastes the code.',
        '  -> POST /api/verify-signup-with-code { email, code }.',
        '  -> Server: fresh non-persisting createClient(anon), verifyOtp',
        '    with type:"signup", returns { access_token, refresh_token }.',
        '  -> Client setSession then router push /auth/callback?type=signup',
        '    &auto=true.',
        '  -> /auth/callback detects an active session and runs the existing',
        '    createCompanyFromMetadata + redirect pipeline.',
        '',
        '"Resend code" on the success page uses supabase.auth.resend({ type:',
        '"signup" }) directly - no /api/resend-confirmation call - so the',
        'user always receives the same Supabase-templated email and there is',
        'never a stale or mismatched code in the inbox.',
        '',
        'Supabase Dashboard template "Confirm sign up" was updated in this',
        'same change session (HTML email with the 6-digit code rendered',
        'prominently, no link to click).',
        '',
        'Files',
        '  app/api/verify-signup-with-code/route.ts (NEW)',
        '  app/auth/sign-up/page.tsx           (drop Resend + emailRedirectTo)',
        '  app/auth/sign-up-success/page.tsx   (rewritten as code-entry)',
        '  lib/version.ts -> 3.74.290'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.290 pushed" -ForegroundColor Green
}
