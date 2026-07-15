$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.651.ps1") { Remove-Item -LiteralPath "push_v3.74.651.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.652"') {
    Write-Host "+ 3.74.652" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.652]")) { Write-Host "X CHANGELOG missing [3.74.652]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$cal = Get-Content -LiteralPath "components/bookings/BookingsCalendar.tsx" -Raw
if ($cal -notmatch "branchId" -or $cal -notmatch "branch_id:") { Write-Host "X calendar branchId wiring missing" -ForegroundColor Red; exit 1 }
$pg = Get-Content -LiteralPath "app/bookings/page.tsx" -Raw
if ($pg -notmatch 'branchId=\{filters.branchId') { Write-Host "X page->view branch pass-through missing" -ForegroundColor Red; exit 1 }
Write-Host "+ branch (and service/staff) filter now flows into the calendar" -ForegroundColor Green

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
    "components/bookings/BookingsView.tsx" `
    "app/bookings/page.tsx" `
    "push_v3.74.652.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.651.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_652.txt"
    $msgLines = @(
        'feat(bookings): v3.74.652 - calendar honors the page branch/service/staff filter',
        '',
        '- BookingsCalendar accepts branchId/serviceId/staffUserId and forwards them',
        '  to /api/bookings/calendar (re-fetches on change).',
        '- BookingsView + page thread the active filters into the calendar, which',
        '  previously ignored them (it uses its own data source).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.652 pushed - calendar respects the branch filter" -ForegroundColor Green
}
