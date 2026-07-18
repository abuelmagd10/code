$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.694.ps1") { Remove-Item -LiteralPath "push_v3.74.694.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.695"') {
    Write-Host "+ 3.74.695" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.695]")) { Write-Host "X CHANGELOG missing [3.74.695]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260718000695_v3_74_695_fix_role_notification_supersede.sql")) { Write-Host "X 695 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "assigned_to_role IS NOT DISTINCT FROM NEW\.assigned_to_role") {
    Write-Host "X functions.sql missing the role-aware supersede guard (dump incomplete)" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot captured the role-aware supersede guard" -ForegroundColor Green

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
    "supabase/migrations/20260718000695_v3_74_695_fix_role_notification_supersede.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.695.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.694.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_695.txt"
    $msgLines = @(
        'fix(notifications): v3.74.695 - a role notification no longer archives another role copy',
        '',
        '- notification_supersede_older_approval_trg matched role-targeted rows on',
        '  company+category+reference but not on assigned_to_role, so notifying',
        '  several roles about one document made each insert archive the previous',
        '  role copy. The owner never saw purchase-order approval requests because',
        '  the manager copy (0.2s later) archived them.',
        '- Supersede now requires the same assigned_to_role, and the migration',
        '  restores copies archived by this bug.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.695 pushed - role notifications no longer cancel each other" -ForegroundColor Green
}
