$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.674.ps1") { Remove-Item -LiteralPath "push_v3.74.674.ps1" -Force }
if (Test-Path "tsc675.log") { Remove-Item -LiteralPath "tsc675.log" -Force -ErrorAction SilentlyContinue }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.675"') {
    Write-Host "+ 3.74.675" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.675]")) { Write-Host "X CHANGELOG missing [3.74.675]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

# TS-only release (no DB change).
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
    "app/api/products/route.ts" `
    "app/api/services/route.ts" `
    "push_v3.74.675.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.674.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_675.txt"
    $msgLines = @(
        'feat(rbac): v3.74.675 - branch-scoped creation permissions for products & services',
        '',
        '- POST /api/products: allowlist owner/admin/general_manager + branch',
        '  manager + purchasing_officer (403 otherwise; store manager, accountant,',
        '  booking officer, staff blocked). general_manager is now company-wide;',
        '  branch manager + purchasing_officer are branch-scoped with forced accounts.',
        '- POST /api/services: allowlist owner/admin/general_manager + branch manager.',
        '- BOM link endpoint already restricted to those roles (store manager excluded).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.675 pushed - branch-scoped creation permissions" -ForegroundColor Green
}
