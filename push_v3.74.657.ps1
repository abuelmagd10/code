$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.656.ps1") { Remove-Item -LiteralPath "push_v3.74.656.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.657"') {
    Write-Host "+ 3.74.657" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.657]")) { Write-Host "X CHANGELOG missing [3.74.657]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
if ($bf -notmatch "trigger=\{") { Write-Host "X trigger prop not passed (duplicate button not fixed)" -ForegroundColor Red; exit 1 }
if ($bf -notmatch "clearErrors\(`"customer_id`"\)") { Write-Host "X clearErrors safeguard missing" -ForegroundColor Red; exit 1 }
# ensure there is no longer a standalone onClick add-customer button
if ($bf -match "setCustDialogOpen\(true\)") { Write-Host "X leftover standalone open button still present" -ForegroundColor Red; exit 1 }
Write-Host "+ single customer button via dialog trigger; no leftover button" -ForegroundColor Green

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
    "components/bookings/BookingForm.tsx" `
    "push_v3.74.657.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.656.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_657.txt"
    $msgLines = @(
        'fix(bookings): v3.74.657 - remove duplicate New Customer button + UUID flash',
        '',
        '- CustomerFormDialog renders its own default trigger button; we now pass our',
        '  button as `trigger` so only one button shows (under the customer picker).',
        '- clearErrors(customer_id) after selecting the created customer removes the',
        '  transient "Invalid UUID format" flash.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.657 pushed - single customer button, no flash" -ForegroundColor Green
}
