$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.691.ps1") { Remove-Item -LiteralPath "push_v3.74.691.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.692"') {
    Write-Host "+ 3.74.692" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.692]")) { Write-Host "X CHANGELOG missing [3.74.692]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Counts and list must share one scoped source; no chip may read the raw feed.
$pg = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($pg -notmatch "const historyScoped = useMemo") { Write-Host "X historyScoped memo missing" -ForegroundColor Red; exit 1 }
if ($pg -match "\(\{history\.filter\(h => h\.category") { Write-Host "X a chip still counts the raw history feed" -ForegroundColor Red; exit 1 }
if ($pg -match "\(\{history\.length\}\)") { Write-Host "X the All chip still counts the raw history feed" -ForegroundColor Red; exit 1 }
Write-Host "+ chip counts and list share the scoped history source" -ForegroundColor Green

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
    "push_v3.74.692.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.691.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_692.txt"
    $msgLines = @(
        'fix(approvals): v3.74.692 - decision-log chip counts now follow the branch/warehouse filter',
        '',
        '- The history filter chips counted the raw feed while the rendered list',
        '  applied role visibility + branch/warehouse scope, so chips advertised',
        '  rows the list hid (e.g. "All (24)" over an empty list).',
        '- Both now read a single scoped source (historyScoped memo).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.692 pushed - decision-log counts respect filters" -ForegroundColor Green
}
