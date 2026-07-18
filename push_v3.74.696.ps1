$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.695.ps1") { Remove-Item -LiteralPath "push_v3.74.695.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.696"') {
    Write-Host "+ 3.74.696" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.696]")) { Write-Host "X CHANGELOG missing [3.74.696]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# No counter anywhere may read the raw history feed.
$pg = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($pg -match "\`$\{history\.length\}" -or $pg -match "history\.filter\(") {
    Write-Host "X a counter still reads the raw history feed" -ForegroundColor Red; exit 1
}
if ($pg -notmatch "\`$\{historyScoped\.length\}") {
    Write-Host "X history tab does not use the scoped count" -ForegroundColor Red; exit 1
}
Write-Host "+ every history counter reads the scoped feed" -ForegroundColor Green

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
    "push_v3.74.696.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.695.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_696.txt"
    $msgLines = @(
        'fix(approvals): v3.74.696 - History tab counter follows the user scope',
        '',
        '- The History tab still counted the raw feed, showing "History (14)" to a',
        '  branch manager whose scoped log held a single row (chips and list were',
        '  already correct). It now reads the same historyScoped source.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.696 pushed - History tab count scoped" -ForegroundColor Green
}
