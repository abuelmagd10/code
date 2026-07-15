$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.666.ps1") { Remove-Item -LiteralPath "push_v3.74.666.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.667"') {
    Write-Host "+ 3.74.667" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.667]")) { Write-Host "X CHANGELOG missing [3.74.667]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

# Frontend-only release (no DB change) — no functions.sql dump needed.
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
    "app/products/page.tsx" `
    "push_v3.74.667.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.666.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_667.txt"
    $msgLines = @(
        'fix(products): v3.74.667 - show accounting linkage (read-only) for normal roles on item edit',
        '',
        '- A disabled Radix Select never opens, so it could not render its',
        '  selected value; the income/expense account fields appeared blank for',
        '  normal roles even though the account was stored correctly.',
        '- Normal roles now see the assigned account as read-only text (code +',
        '  name). Same governance: they still cannot change it (server resolves',
        '  the account on save, v3.74.654). Upper roles keep the editable select.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.667 pushed - accounting linkage visible for normal roles" -ForegroundColor Green
}
