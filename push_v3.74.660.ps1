$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.659.ps1") { Remove-Item -LiteralPath "push_v3.74.659.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.660"') {
    Write-Host "+ 3.74.660" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.660]")) { Write-Host "X CHANGELOG missing [3.74.660]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/bookings/availability/route.ts" -Raw
$cmp = Get-Content -LiteralPath "components/bookings/AvailabilityChecker.tsx" -Raw
if ($api -match "Africa/Cairo") { Write-Host "X hardcoded Africa/Cairo still present (must be global)" -ForegroundColor Red; exit 1 }
if ($api -notmatch "get\('tz'\)" -or $cmp -notmatch "resolvedOptions\(\).timeZone") { Write-Host "X client/server timezone wiring missing" -ForegroundColor Red; exit 1 }
Write-Host "+ availability uses the browser IANA timezone (global), UTC fallback" -ForegroundColor Green

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
    "app/api/bookings/availability/route.ts" `
    "components/bookings/AvailabilityChecker.tsx" `
    "push_v3.74.660.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.659.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_660.txt"
    $msgLines = @(
        'fix(bookings): v3.74.660 - past slots shown available (timezone), global',
        '',
        '- Availability compared slot times against the UTC server clock, so past',
        '  slots (5:40 PM at 7:29 PM local) still looked available.',
        '- The client now sends its IANA timezone (?tz=) and the server computes',
        '  `now` as that zone''s wall-clock (validated, UTC fallback). Works in any',
        '  country - no hardcoded timezone.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.660 pushed - availability uses the user's timezone (global)" -ForegroundColor Green
}
