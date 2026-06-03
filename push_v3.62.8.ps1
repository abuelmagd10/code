# v3.62.8 - Harden /api/sentry-test behind env flag
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
foreach ($f in @("lib/version.ts", "app/api/sentry-test/route.ts")) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.8"') { Write-Host "  + APP_VERSION = 3.62.8" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.8" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/sentry-test/route.ts" -Raw
if ($route -match 'SENTRY_TEST_ENABLED' -and $route -match '404') {
    Write-Host "  + Endpoint hardened behind SENTRY_TEST_ENABLED" -ForegroundColor Green
} else { Write-Host "  X Endpoint not hardened" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/api/sentry-test/route.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "chore(sentry): v3.62.8 - harden /api/sentry-test behind env flag

In production the endpoint now returns 404 unless SENTRY_TEST_ENABLED=1
is explicitly set. Even with the flag, ?confirm=1 is still required.

Why: a passing scanner could hit /api/sentry-test and fire as many
fake errors as it wanted. That would drown out real bugs in the
issue list and burn through the project event quota for no reason.

Re-verification flow:
  1. Set SENTRY_TEST_ENABLED=1 on Vercel (production env)
  2. Hit /api/sentry-test?confirm=1
  3. Unset SENTRY_TEST_ENABLED immediately after

Files:
  Modified: app/api/sentry-test/route.ts
  Modified: lib/version.ts (3.62.7 -> 3.62.8)

The 2 existing test events in Sentry (7ESAB-ERB-1, 7ESAB-ERB-2 from
v3.62.5 verification) will be marked Resolved separately.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.8 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  curl -i https://7esab.com/api/sentry-test" -ForegroundColor White
    Write-Host "  -> expect HTTP 404 Not Found" -ForegroundColor Gray
}
