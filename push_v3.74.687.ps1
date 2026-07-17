$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.686.ps1") { Remove-Item -LiteralPath "push_v3.74.686.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.687"') {
    Write-Host "+ 3.74.687" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.687]")) { Write-Host "X CHANGELOG missing [3.74.687]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Frontend-only release (no DB migration) — verify the two history chips exist.
$pg = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($pg -notmatch 'historyFilter === "booking_custody_return"' -or $pg -notmatch 'historyFilter === "booking_stock_withdrawal"') {
    Write-Host "X approvals history chips missing" -ForegroundColor Red; exit 1
}
Write-Host "+ history filter chips present (bwd + bcr)" -ForegroundColor Green

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
    "app/approvals/page.tsx" `
    "push_v3.74.687.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.686.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_687.txt"
    $msgLines = @(
        'fix(approvals): v3.74.687 - show booking withdrawal + custody return chips in the decision log',
        '',
        '- The history filter row was missing chips for booking_stock_withdrawal',
        '  and booking_custody_return. Added both, gated by canShowHistory so each',
        '  user sees the log for exactly the cards their role can see.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.687 pushed - approvals history aligned with card visibility" -ForegroundColor Green
}
