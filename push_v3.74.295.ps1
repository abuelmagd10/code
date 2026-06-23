$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.293.ps1") { Remove-Item -LiteralPath "push_v3.74.293.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.295"') {
    Write-Host "+ 3.74.295" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# v3.74.294 — Resend diagnostics + manual-fallback UX
$si = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
foreach ($n in @('Resend rejected','email_delivered','email_error','resend_status_')) {
    if ($si -notmatch [regex]::Escape($n)) {
        Write-Host "X send-invite missing diagnostic: $n" -ForegroundColor Red; exit 1
    }
}
$up = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($up -notmatch [regex]::Escape('email_delivered')) {
    Write-Host "X users page does not surface email_delivered:false to inviter" -ForegroundColor Red; exit 1
}
Write-Host "+ send-invite + users page: Resend failure surfaced clearly" -ForegroundColor Green

# v3.74.295 — friendly email_mismatch panel
$ai = Get-Content -LiteralPath "app/api/accept-invite-logged-in/route.ts" -Raw
foreach ($n in @('سجّل خروج من الحساب الحالى','invited_email','current_email')) {
    if ($ai -notmatch [regex]::Escape($n)) {
        Write-Host "X accept-invite-logged-in missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ accept-invite-logged-in: human-readable message + code field" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_295.txt"
    $msgLines = @(
        'fix(invite): v3.74.295 - clearer invite UX (Resend failure + email_mismatch panel)',
        '',
        'Two invitation-flow corrections shipped together (294 was never',
        'deployed separately):',
        '',
        '== v3.74.294: surface Resend failures + log full response ==',
        '',
        'Inviter sent an invitation, status 200 came back, but the invitee',
        'never received an email. The send-invite route silently fell',
        'through to the "manual" path whenever Resend returned a non-id',
        'response, so the inviter saw a green success toast and assumed',
        'the email was on its way.',
        '',
        '  app/api/send-invite/route.ts',
        '    - Log the full Resend HTTP status + response body + from / to',
        '      addresses when the call does not come back with an id, so',
        '      we can read the real reason (unverified domain, expired',
        '      key, ...) from Vercel runtime logs.',
        '    - Return email_delivered:false + email_error in the JSON',
        '      response when we fall back to the manual link path.',
        '    - Explicit branch for missing RESEND_API_KEY in env.',
        '',
        '  app/settings/users/page.tsx',
        '    - When email_delivered is false (or type==="manual"), show',
        '      the warning string from the API instead of the generic',
        '      success toast. Tells the inviter to use the "نسخ الرابط"',
        '      button and share the link manually.',
        '',
        '== v3.74.295: friendly email_mismatch panel ==',
        '',
        'Invitee opened the accept link in a browser where someone else',
        'was already signed in. /api/accept-invite-logged-in correctly',
        'refused with 403, but the rendered error was the literal string',
        '"email_mismatch" with no explanation and no sign-out option.',
        '',
        'Root cause: apiError signature is',
        '    apiError(status, message, messageEn?, details?, code?)',
        'and the original call passed "email_mismatch" as the *message*',
        'and the Arabic explanation as messageEn. The page switches on',
        'js.code === "email_mismatch" to render the friendly amber panel',
        '+ sign-out button; without code set it fell through and rendered',
        'the raw message string.',
        '',
        'Fix: Arabic sentence in message, "email_mismatch" in code,',
        'include invited_email + current_email in details. Page now',
        'enters the email_mismatch branch which shows both addresses and',
        'a "تسجيل الخروج" button.',
        '',
        'Files',
        '  app/api/send-invite/route.ts',
        '  app/settings/users/page.tsx',
        '  app/api/accept-invite-logged-in/route.ts',
        '  lib/version.ts -> 3.74.295'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.295 pushed" -ForegroundColor Green
}
