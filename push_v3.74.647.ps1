$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.646.ps1") { Remove-Item -LiteralPath "push_v3.74.646.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.647"') {
    Write-Host "+ 3.74.647" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($ver in @('3.74.638','3.74.639','3.74.640','3.74.641','3.74.642','3.74.643','3.74.644','3.74.645','3.74.646')) {
    if ($cl -notmatch [regex]::Escape("[$ver]")) { Write-Host "X CHANGELOG missing $ver" -ForegroundColor Red; exit 1 }
}
Write-Host "+ CHANGELOG documents v3.74.638 -> v3.74.646 (9 entries)" -ForegroundColor Green

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
    "push_v3.74.647.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.646.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_647.txt"
    $msgLines = @(
        'docs(changelog): v3.74.647 - record v3.74.638..646 session work',
        '',
        'Adds human-readable CHANGELOG entries (Symptom/Fix/Verification) for the',
        'nine releases delivered this session: role model, product accounting',
        'linkage + service revenue, single-owner self-approval, paid-requires-journal',
        'guard, expense-account guard, auto product SKU, and the bookings branch',
        'filter. Documentation only - no code or schema changes.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.647 pushed - session changelog recorded" -ForegroundColor Green
}
