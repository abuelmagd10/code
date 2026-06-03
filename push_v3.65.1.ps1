# v3.65.1 - Hotfix: middleware matcher allows static .html
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.65.1"') { Write-Host "+ APP_VERSION = 3.65.1" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.65.1" -ForegroundColor Red; exit 1 }

$mw = Get-Content -LiteralPath "middleware.ts" -Raw
if ($mw -match 'html\|txt\|xml\|ico') {
    Write-Host "+ matcher excludes .html/.txt/.xml/.ico" -ForegroundColor Green
} else { Write-Host "X matcher not patched" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts middleware.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(middleware): v3.65.1 - exclude .html/.txt/.xml/.ico from auth matcher

The middleware matcher was capturing static files in /public and
redirecting unauthenticated requests to /auth/login. Most visible
symptom: Google Search Console verification file
(/googlebab064d0744a7afb.html) returned the login page HTML
instead of the plain verification line, so Google could not
verify ownership of the site.

Extended the exclusion list to also exclude .html, .txt, .xml,
and .ico. Static files in /public now serve directly.

Files:
  Modified: middleware.ts
  Modified: lib/version.ts (3.65.0 -> 3.65.1)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.65.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel deploys (~1 min):" -ForegroundColor Cyan
    Write-Host "  1. Open https://7esab.com/googlebab064d0744a7afb.html in incognito" -ForegroundColor White
    Write-Host "     -> should show ONLY the verification line, no login page" -ForegroundColor Gray
    Write-Host "  2. Back to Google Search Console -> click VERIFY" -ForegroundColor White
    Write-Host "  3. Once verified -> Sitemaps -> submit sitemap.xml" -ForegroundColor White
}
