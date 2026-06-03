# v3.74.3 hotfix - dividend RPC ambiguity (PGRST203)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.3"') { Write-Host "+ APP_VERSION = 3.74.3" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.3" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.3\]' -and $cl -match 'PGRST203') {
    Write-Host "+ CHANGELOG entry for 3.74.3 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.3 entry" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(dividends): v3.74.3 - drop duplicate distribute_dividends_atomic

Ahmed tested dividend distribution and got HTTP 300 PGRST203:
'Could not choose the best candidate function between
p_fiscal_period => text and p_fiscal_period => uuid'.

Two overloads of distribute_dividends_atomic existed in DB:
  1. ..., p_fiscal_period text, ...  <- TypeScript expects this
  2. ..., p_fiscal_period uuid, ...  <- orphan upgrade never wired

When client sent p_fiscal_period: null or a string, PostgREST
refused to pick a side and the distribution never executed.

Fix:
  DB migration drops the uuid variant. Migration ends with a
  guard (RAISE EXCEPTION if signature count != 1) so this stays
  single-overload going forward. TypeScript side was always
  correct - only the DB was broken.

Note on unrelated InvalidNodeTypeError in console:
  That comes from Sentry instrumentation wrapping a detached
  DOM node, not from our code. Not blocking. Will track if it
  appears in production user sessions.

Verify:
  /shareholders -> distribute dividends -> succeeds, journal
  entry posts, no PGRST203.

Files:
  DB migration: v3_74_3_drop_duplicate_distribute_dividends_uuid_variant
  Modified: lib/version.ts (3.74.2 -> 3.74.3)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.3 pushed" -ForegroundColor Green
}
