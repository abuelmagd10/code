$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.652.ps1") { Remove-Item -LiteralPath "push_v3.74.652.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.653"') {
    Write-Host "+ 3.74.653" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.653]")) { Write-Host "X CHANGELOG missing [3.74.653]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$cal = Get-Content -LiteralPath "components/bookings/BookingsCalendar.tsx" -Raw
if ($cal -match "toISOString\(\)\.split") { Write-Host "X toYMD still uses toISOString (off-by-one not fixed)" -ForegroundColor Red; exit 1 }
if ($cal -notmatch "getFullYear\(\)") { Write-Host "X toYMD local-date fix missing" -ForegroundColor Red; exit 1 }
Write-Host "+ calendar toYMD uses local date parts (no UTC off-by-one)" -ForegroundColor Green

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
    "components/bookings/BookingsCalendar.tsx" `
    "push_v3.74.653.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.652.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_653.txt"
    $msgLines = @(
        'fix(bookings): v3.74.653 - calendar off-by-one (UTC) placed bookings a day late',
        '',
        '- toYMD used Date.toISOString() (UTC); calendar cells are local midnight, so',
        '  in UTC+ timezones the key slipped back a day and bookings rendered one',
        '  cell late. Now formats local getFullYear/Month/Date.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.653 pushed - calendar dates aligned with the table" -ForegroundColor Green
}
