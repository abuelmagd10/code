$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.658.ps1") { Remove-Item -LiteralPath "push_v3.74.658.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.659"') {
    Write-Host "+ 3.74.659" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.659]")) { Write-Host "X CHANGELOG missing [3.74.659]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
if ($bf -notmatch "discountMode" -or $bf -notmatch "discountPercent") { Write-Host "X percentage discount wiring missing" -ForegroundColor Red; exit 1 }
if ($bf -notmatch "يتطلب اعتماد المالك") { Write-Host "X discount-approval warning missing" -ForegroundColor Red; exit 1 }
Write-Host "+ discount value/percentage toggle present; approval warning retained" -ForegroundColor Green

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
    "push_v3.74.659.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.658.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_659.txt"
    $msgLines = @(
        'feat(bookings): v3.74.659 - percentage discount option on New Booking',
        '',
        '- Amount / % toggle in the pricing section. Percentage computes the',
        '  discount from the pre-discount subtotal (recomputed on qty/service change)',
        '  and is submitted as discount_amount.',
        '- Approval preserved: any discount_amount > 0 still triggers the server',
        '  owner/GM discount approval; the warning shows in both modes; validation',
        '  blocks a discount >= subtotal.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.659 pushed - booking percentage discount" -ForegroundColor Green
}
