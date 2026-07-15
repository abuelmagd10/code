$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.649.ps1") { Remove-Item -LiteralPath "push_v3.74.649.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.650"') {
    Write-Host "+ 3.74.650" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Keep the CHANGELOG-enforcing hook enabled
if (Test-Path ".githooks/pre-push") {
    git config core.hooksPath .githooks 2>&1 | Out-Null
}

# CHANGELOG must document this version (same rule the hook enforces)
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.650]")) { Write-Host "X CHANGELOG missing [3.74.650]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$cec = Get-Content -LiteralPath "components/bookings/CalendarEventCard.tsx" -Raw
if ($cec -notmatch "title=\{tip\}" -or $cec -notmatch "PAY_META") { Write-Host "X calendar card enrichment missing" -ForegroundColor Red; exit 1 }
Write-Host "+ calendar event card enriched" -ForegroundColor Green

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
    "components/bookings/CalendarEventCard.tsx" `
    "push_v3.74.650.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.649.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_650.txt"
    $msgLines = @(
        'feat(bookings): v3.74.650 - richer booking cards in the calendar view',
        '',
        '- CalendarEventCard now shows time range, customer, service, status,',
        '  total + payment status, and a full hover tooltip (booking no, phone,',
        '  staff, outstanding, branch...).',
        '- Compact cells (>2 bookings/day) keep the time/status + customer lines',
        '  plus the tooltip.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.650 pushed - richer calendar booking cards" -ForegroundColor Green
}
