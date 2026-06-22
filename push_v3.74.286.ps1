$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.285.ps1") { Remove-Item -LiteralPath "push_v3.74.285.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.286"') {
    Write-Host "+ 3.74.286" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$slp = Get-Content -LiteralPath "components/SidebarLayoutProvider.tsx" -Raw
if ($slp -notmatch '/auth/force-change-password') {
    Write-Host "X SidebarLayoutProvider missing /auth/force-change-password" -ForegroundColor Red; exit 1
}
Write-Host "+ SidebarLayoutProvider: /auth/force-change-password now hides sidebar" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_286.txt"
    $msgLines = @(
        'fix(auth): v3.74.286 - hide app sidebar on /auth/force-change-password',
        '',
        'When a user clicked a password-reset link from an email on a browser',
        'where another company was previously signed in, the page would render',
        'with the previous company sidebar visible alongside the password form.',
        '',
        'Root cause: SidebarLayoutProvider only hid the sidebar on a fixed list',
        'of public auth routes (/auth/login, /auth/sign-up, /auth/callback,',
        'etc.). /auth/force-change-password was not in that list because the',
        'route was added later for the forced first-login + recovery flow.',
        '',
        'After verifyOtp the auth session is replaced with the recovery user,',
        'but the cached active_company_id in localStorage / cookie still points',
        'at the previous tenant, so the sidebar renders the old menu.',
        '',
        'Fix: add /auth/force-change-password to PREFIX_HIDE_PATHS. After the',
        'user saves the new password, /api/accept-membership writes the correct',
        'active_company_id and the redirect goes to the right workspace, so no',
        'other logic needs to change.',
        '',
        'Files',
        '  components/SidebarLayoutProvider.tsx',
        '  lib/version.ts -> 3.74.286'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.286 pushed" -ForegroundColor Green
}
