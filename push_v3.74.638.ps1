$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.637.ps1") { Remove-Item -LiteralPath "push_v3.74.637.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.638"') {
    Write-Host "+ 3.74.638" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ca = Get-Content -LiteralPath "lib/company-authorization.ts" -Raw
if ($ca -notmatch 'UPPER_ROLES = \["owner", "admin", "general_manager"\]') { Write-Host "X UPPER_ROLES not corrected" -ForegroundColor Red; exit 1 }
if ($ca -match 'UPPER_ROLES = \["owner", "admin", "manager"\]') { Write-Host "X old UPPER_ROLES still present" -ForegroundColor Red; exit 1 }
Write-Host "+ UPPER_ROLES = owner/admin/general_manager (manager is branch-scoped)" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "X npm install exceljs failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

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
    "lib/company-authorization.ts" `
    "supabase/schema/functions.sql" `
    "push_v3.74.638.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.637.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_638.txt"
    $msgLines = @(
        'fix(authz): v3.74.638 - branch manager is branch-scoped; general_manager is company-wide',
        '',
        '- UPPER_ROLES corrected to owner/admin/general_manager (was owner/admin/manager).',
        '- Effect on the product form: branch manager (and below) now gets the',
        '  locked "assigned to your branch" location and auto/locked accounting',
        '  linkage; owner, admin, general_manager keep free choice.',
        '- Company selection is unaffected (members resolve via membership; the',
        '  upper-role path is only an ownership fallback).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.638 pushed - manager branch-scoped, GM company-wide" -ForegroundColor Green
}
