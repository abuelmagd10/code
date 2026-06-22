$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.293.ps1") { Remove-Item -LiteralPath "push_v3.74.293.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.294"') {
    Write-Host "+ 3.74.294" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$si = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
foreach ($n in @('Resend rejected','email_delivered','email_error','resend_status_')) {
    if ($si -notmatch [regex]::Escape($n)) {
        Write-Host "X send-invite missing diagnostic: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ send-invite: detailed Resend logging in place" -ForegroundColor Green

$up = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($up -notmatch [regex]::Escape('email_delivered')) {
    Write-Host "X users page does not surface email_delivered:false to inviter" -ForegroundColor Red; exit 1
}
Write-Host "+ users page: warns inviter when Resend failed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_294.txt"
    $msgLines = @(
        'fix(invite): v3.74.294 - surface Resend failures + log full response',
        '',
        'Inviter sent a successful invitation after v3.74.293 (DB row + link',
        'created, status 200), but the invitee never received an email. The',
        'old send-invite route silently fell through to the "manual" path',
        'whenever Resend returned a non-id response, so the inviter saw a',
        'green success toast and assumed the email was on its way.',
        '',
        'Two changes:',
        '',
        '  app/api/send-invite/route.ts',
        '    - Log the full Resend HTTP status + response body + from / to',
        '      addresses when the call does not come back with an id.',
        '      Lets us diagnose unverified-domain / bad-API-key / network',
        '      issues from Vercel runtime logs without redeploying.',
        '    - Emit email_delivered:false and email_error in the JSON',
        '      response when we fall back to the manual link path so the',
        '      client can react.',
        '    - Add an early branch for the case where RESEND_API_KEY is',
        '      missing in env — previously this was a silent fall-through.',
        '',
        '  app/settings/users/page.tsx',
        '    - When email_delivered is false (or type==="manual"), show',
        '      the warning string from the API instead of the generic',
        '      success toast. Tells the inviter to use the "نسخ الرابط"',
        '      button to copy the accept link and share it manually.',
        '',
        'The invitation row + link are unchanged on this path; only the',
        'inviter-facing UX is corrected.',
        '',
        'Files',
        '  app/api/send-invite/route.ts',
        '  app/settings/users/page.tsx',
        '  lib/version.ts -> 3.74.294'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.294 pushed" -ForegroundColor Green
}
