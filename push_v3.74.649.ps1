$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.648.ps1") { Remove-Item -LiteralPath "push_v3.74.648.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.649"') {
    Write-Host "+ 3.74.649" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Self-install the CHANGELOG-enforcing pre-push hook for this clone
if (Test-Path ".githooks/pre-push") {
    git config core.hooksPath .githooks 2>&1 | Out-Null
    git update-index --add --chmod=+x .githooks/pre-push 2>$null
    Write-Host "+ pre-push hook enabled (core.hooksPath = .githooks)" -ForegroundColor Green
} else { Write-Host "X .githooks/pre-push missing" -ForegroundColor Red; exit 1 }

# CHANGELOG must document this version (same rule the hook enforces)
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.649]")) { Write-Host "X CHANGELOG missing [3.74.649]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

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
    ".githooks/pre-push" `
    "push_v3.74.649.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.648.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_649.txt"
    $msgLines = @(
        'chore(release): v3.74.649 - enforce CHANGELOG on every push',
        '',
        '- .githooks/pre-push blocks a push when lib/version.ts APP_VERSION has no',
        '  matching "## [<version>]" section in CHANGELOG.md.',
        '- Release scripts self-enable the hook (core.hooksPath = .githooks) and',
        '  verify the entry before pushing.',
        '- Backfills CHANGELOG entries for v3.74.647 and v3.74.648.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.649 pushed - CHANGELOG now enforced on every push" -ForegroundColor Green
}
