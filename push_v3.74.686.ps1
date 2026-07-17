$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.685.ps1") { Remove-Item -LiteralPath "push_v3.74.685.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.686"') {
    Write-Host "+ 3.74.686" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.686]")) { Write-Host "X CHANGELOG missing [3.74.686]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260717000686_v3_74_686_custody_return_receipt_approval.sql")) { Write-Host "X 686 migration record missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "app/api/booking-custody-returns/[id]/decide/route.ts")) { Write-Host "X custody-return decide route missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "decide_booking_custody_return" -or $fn -notmatch "fn_request_booking_custody_return") {
    Write-Host "X functions.sql missing the custody-return receipt functions (dump incomplete)" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot captured the custody-return receipt flow" -ForegroundColor Green

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
    "supabase/migrations/20260717000686_v3_74_686_custody_return_receipt_approval.sql" `
    "supabase/schema/functions.sql" `
    "app/approvals/page.tsx" `
    "lib/notification-routing.ts" `
    "push_v3.74.686.ps1" 2>&1 | Out-Null
git add -- "app/api/booking-custody-returns/[id]/decide/route.ts" 2>&1 | Out-Null
git add -u -- "push_v3.74.685.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_686.txt"
    $msgLines = @(
        'feat(bookings): v3.74.686 - custody return receipt approval + notifications (phase 2)',
        '',
        '- Cancelling a booking whose materials are in technician custody now',
        '  REQUESTS a return (custody_status=return_pending) and notifies the',
        '  branch store manager to confirm receipt in the approvals inbox (bcr tab).',
        '- Approving posts the return to the warehouse (Dr inventory / Cr custody)',
        '  and notifies the requester; no store manager => auto-return + notify.',
        '- Rejecting (not received) keeps custody out and escalates to management.',
        '- New bcr tab (card + history + visibility roles), decide API route, and',
        '  booking_custody_return notification routing.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.686 pushed - custody return receipt approval (phase 2)" -ForegroundColor Green
}
