$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.636.ps1") { Remove-Item -LiteralPath "push_v3.74.636.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.637"') {
    Write-Host "+ 3.74.637" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/products-list/route.ts" -Raw
if ($api -notmatch 'general_manager' -or $api -match '"owner", "admin", "manager"') { Write-Host "X products-list scope not fixed" -ForegroundColor Red; exit 1 }
if ($api -notmatch 'branch:branch_id') { Write-Host "X products-list branch join missing" -ForegroundColor Red; exit 1 }
$pp = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pp -notmatch 'row.branch_name \|\|') { Write-Host "X products page branch-name preference missing" -ForegroundColor Red; exit 1 }
Write-Host "+ branch scope + branch name fixes present" -ForegroundColor Green

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
    "app/api/products-list/route.ts" `
    "app/products/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.637.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.636.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_637.txt"
    $msgLines = @(
        'fix(products): v3.74.637 - branch manager sees own-branch products + branch name resolves',
        '',
        '- products-list API: branch manager is no longer treated as company-wide;',
        '  only owner/admin/general_manager see all products, everyone else is',
        '  scoped to their branch.',
        '- API also returns each product''s branch_name (joined), so the list shows',
        '  the correct branch for every role instead of "Unknown".'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.637 pushed - branch scope + branch name" -ForegroundColor Green
}
