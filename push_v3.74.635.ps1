$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.634.ps1") { Remove-Item -LiteralPath "push_v3.74.634.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.635"') {
    Write-Host "+ 3.74.635" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pp = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($pp -notmatch 'requires_withdrawal_approval') { Write-Host "X product form toggle missing" -ForegroundColor Red; exit 1 }
$pa = Get-Content -LiteralPath "app/api/products/route.ts" -Raw
if ($pa -notmatch 'requires_withdrawal_approval') { Write-Host "X products API create passthrough missing" -ForegroundColor Red; exit 1 }
Write-Host "+ product form toggle + API passthrough present" -ForegroundColor Green

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
    "app/products/page.tsx" `
    "app/api/products/route.ts" `
    "supabase/schema/functions.sql" `
    "push_v3.74.635.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.634.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_635.txt"
    $msgLines = @(
        'feat(products): v3.74.635 - "requires withdrawal approval" toggle on product form',
        '',
        '- Products & Services page: add/edit product dialog now has a checkbox',
        '  "Requires warehouse withdrawal approval when used in a booking"',
        '  (products only). Persists on update (passthrough) and on create',
        '  (post-create follow-up in /api/products). Completes stage 2 of the',
        '  booking stock-withdrawal feature (self-serve config).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.635 pushed - product withdrawal-approval toggle" -ForegroundColor Green
}
