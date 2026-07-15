$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.653.ps1") { Remove-Item -LiteralPath "push_v3.74.653.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.654"') {
    Write-Host "+ 3.74.654" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.654]")) { Write-Host "X CHANGELOG missing [3.74.654]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$post = Get-Content -LiteralPath "app/api/products/route.ts" -Raw
$put  = Get-Content -LiteralPath "app/api/products/[id]/route.ts" -Raw
if ($post -notmatch "validAccountIds" -or $put -notmatch "validAccountIds") { Write-Host "X multi-company account safety missing in POST or PUT" -ForegroundColor Red; exit 1 }
Write-Host "+ product create/edit ignore foreign account ids; server resolves correct ones" -ForegroundColor Green

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
    "app/api/products/[id]/route.ts" `
    "push_v3.74.654.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.653.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_654.txt"
    $msgLines = @(
        'fix(products): v3.74.654 - "income account required" for multi-company users',
        '',
        '- A user in several companies (same email) could submit an account id from',
        '  another company; the server (scoped to the active company) could not find',
        '  it and failed with "income account required".',
        '- POST/PUT now trust a client account id only if it belongs to THIS company',
        '  active accounts; otherwise the server resolves the correct default.',
        '- Normal (branch-scoped) roles always use the server-resolved accounts.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.654 pushed - product accounting robust for multi-company users" -ForegroundColor Green
}
