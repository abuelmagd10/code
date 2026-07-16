$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.669.ps1") { Remove-Item -LiteralPath "push_v3.74.669.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.670"') {
    Write-Host "+ 3.74.670" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.670]")) { Write-Host "X CHANGELOG missing [3.74.670]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260716000670_v3_74_670_fix_create_notification_overload.sql")) { Write-Host "X 670 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
# Guard: exactly ONE create_notification definition should remain in the snapshot.
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
$m = ([regex]::Matches($fn, "FUNCTION public\.create_notification\(")).Count
if ($m -ne 1) { Write-Host "X expected 1 create_notification in snapshot, found $m" -ForegroundColor Red; exit 1 }
Write-Host "+ snapshot has a single create_notification (ambiguity resolved)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260716000670_v3_74_670_fix_create_notification_overload.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.670.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.669.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_670.txt"
    $msgLines = @(
        'fix(notifications): v3.74.670 - CRITICAL restore all notifications (drop create_notification overload)',
        '',
        '- Two create_notification overloads (15-arg no p_kind, 16-arg with',
        '  p_kind) caused PostgREST PGRST203 ambiguity, so every',
        '  supabase.rpc(create_notification) call failed silently — killing ALL',
        '  notifications company-wide (bookings, approvals, warehouse, ...).',
        '- Dropped the redundant 15-arg overload; the 16-arg superset',
        '  (p_kind DEFAULT info) is now the single unambiguous candidate.',
        '- DB-only fix; effective immediately, no redeploy required.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.670 pushed - notifications restored" -ForegroundColor Green
}
