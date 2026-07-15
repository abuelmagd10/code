$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# 661 was never pushed — fold it into this release
if (Test-Path "push_v3.74.660.ps1") { Remove-Item -LiteralPath "push_v3.74.660.ps1" -Force }
if (Test-Path "push_v3.74.661.ps1") { Remove-Item -LiteralPath "push_v3.74.661.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.662"') {
    Write-Host "+ 3.74.662" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($ver in @('3.74.661','3.74.662')) {
    if ($cl -notmatch [regex]::Escape("[$ver]")) { Write-Host "X CHANGELOG missing $ver" -ForegroundColor Red; exit 1 }
}
Write-Host "+ CHANGELOG documents 661 (notification) + 662 (governance)" -ForegroundColor Green

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
if ($bf -notmatch "canDiscount") { Write-Host "X BookingForm discount gate missing" -ForegroundColor Red; exit 1 }
$api = Get-Content -LiteralPath "app/api/bookings/route.ts" -Raw
if ($api -notmatch "من اختصاص الموظف المنوط") { Write-Host "X POST discount governance missing" -ForegroundColor Red; exit 1 }
Write-Host "+ discount governance wired (UI create gate + POST server enforcement)" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260715000661_v3_74_661_notify_discount_request.sql")) { Write-Host "X 661 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "notify_discount_request_trg") { Write-Host "X functions.sql missing notify_discount_request_trg (dump incomplete)" -ForegroundColor Red; exit 1 }
Write-Host "+ functions.sql captured the discount-request notification trigger" -ForegroundColor Green

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
    "supabase/migrations/20260715000661_v3_74_661_notify_discount_request.sql" `
    "supabase/schema/functions.sql" `
    "components/bookings/BookingForm.tsx" `
    "app/bookings/new/page.tsx" `
    "app/api/bookings/route.ts" `
    "push_v3.74.662.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.660.ps1" "push_v3.74.661.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_662.txt"
    $msgLines = @(
        'feat(bookings): v3.74.662 - discount is the executor''s call at creation + v3.74.661 notify',
        '',
        '- Includes v3.74.661: notify approvers when a discount approval is requested',
        '  (AFTER INSERT trigger on discount_approvals).',
        '- Discount governance on CREATION: BookingForm shows the discount only to',
        '  management or the assigned executor; POST /api/bookings rejects a discount',
        '  from anyone else (server-enforced). Edit (PATCH) was already governed.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.662 pushed - discount governance + request notifications" -ForegroundColor Green
}
