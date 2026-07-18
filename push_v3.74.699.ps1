$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.698.ps1") { Remove-Item -LiteralPath "push_v3.74.698.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.699"') {
    Write-Host "+ 3.74.699" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.699]")) { Write-Host "X CHANGELOG missing [3.74.699]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$pg = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
if ($pg -notmatch "salesDraftCount" -or $pg -notmatch "bookingDraftCount") {
    Write-Host "X draft counters missing on the sales-orders tabs" -ForegroundColor Red; exit 1
}
if ($bt -notmatch "onDraftCountChange") {
    Write-Host "X BookingsTab does not publish its draft count" -ForegroundColor Red; exit 1
}
# the bookings tab must stay mounted, otherwise its counter is unavailable
if ($pg -match "activeTab === 'bookings' && <BookingsTab") {
    Write-Host "X BookingsTab is conditionally mounted - its counter would not load" -ForegroundColor Red; exit 1
}
Write-Host "+ both tab counters read their own scoped source" -ForegroundColor Green

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
    "app/sales-orders/page.tsx" `
    "components/sales-orders/BookingsTab.tsx" `
    "push_v3.74.699.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.698.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_699.txt"
    $msgLines = @(
        'feat(sales-orders): v3.74.699 - draft counters on the Sales / Booking order tabs',
        '',
        '- Each tab card now shows how many of its orders are still drafts.',
        '- Sales count comes from the governed /api/sales-orders list the tab',
        '  renders; the bookings count is published by BookingsTab from its own',
        '  rows using the same "confirmed only" rule it displays. So a badge can',
        '  never advertise orders the user cannot see - same rule as the',
        '  approvals inbox counters.',
        '- BookingsTab stays mounted (hidden) so its counter loads up front.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.699 pushed - draft counters on sales/booking tabs" -ForegroundColor Green
}
