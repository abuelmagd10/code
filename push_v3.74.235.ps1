$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.234.ps1") { Remove-Item -LiteralPath "push_v3.74.234.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.235"') {
    Write-Host "+ 3.74.235" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard: /demo bypasses the session-level redirect to /auth/login
$mw = Get-Content -LiteralPath "lib/supabase/middleware.ts" -Raw
if ($mw -notmatch 'isDemoPage') {
    Write-Host "X middleware still redirects unauth visitors away from /demo" -ForegroundColor Red; exit 1
}
if ($mw -notmatch '!isAuthPage && !isLegalPage && !isContactPage && !isBlogPage && !isDemoPage') {
    Write-Host "X isDemoPage not wired into the auth-gate condition" -ForegroundColor Red; exit 1
}
Write-Host "+ /demo bypasses session middleware - opens for any visitor" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_235.txt"
    $msgLines = @(
        "fix(demo): v3.74.235 - /demo opens for unauth visitors (link sharing)",
        "",
        "Bug report: sharing https://7esab.com/demo?lang=en with a customer",
        "redirected them to /auth/login instead of opening the demo.",
        "",
        "Root cause: v3.74.228 added /demo to the AppShell PUBLIC_PATHS and",
        "the SidebarLayoutProvider hide-list, which handle the client-side",
        "behaviour AFTER the page loads. But there's an earlier server-side",
        "gate in lib/supabase/middleware.ts that runs on every request and",
        "redirects to /auth/login whenever there's no session and the path",
        "isn't on its own allow-list (/auth, /legal, /contact, /blog,",
        "/invitations/accept, /api/cron, ...). /demo wasn't there.",
        "",
        "Fix: add isDemoPage to the middleware allow-list, mirroring the",
        "treatment of /legal and /blog. The shared link now opens for any",
        "visitor without sign-in.",
        "",
        "  lib/supabase/middleware.ts",
        "  lib/version.ts -> 3.74.235"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.235 pushed" -ForegroundColor Green
}
