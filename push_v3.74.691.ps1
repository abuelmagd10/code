$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.690.ps1") { Remove-Item -LiteralPath "push_v3.74.690.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.691"') {
    Write-Host "+ 3.74.691" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.691]")) { Write-Host "X CHANGELOG missing [3.74.691]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260718000691_v3_74_691_remove_confusing_duplicate_discount_notification.sql")) { Write-Host "X 691 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
# generic trigger must skip PO/SO, AND the dedicated PO discount notification must still exist
if ($fn -notmatch "v3\.74\.691") {
    Write-Host "X functions.sql missing the generic-trigger skip (dump incomplete)" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "طلب موافقة على خصم أمر شراء") {
    Write-Host "X the dedicated PO discount notification is missing - aborting" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot: generic trigger skips PO/SO, dedicated discount notification intact" -ForegroundColor Green

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
    "supabase/migrations/20260718000691_v3_74_691_remove_confusing_duplicate_discount_notification.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.691.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.690.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_691.txt"
    $msgLines = @(
        'fix(notifications): v3.74.691 - drop the mislabelled third discount notification on PO/SO',
        '',
        '- A discounted purchase order raised three owner notifications. The third',
        '  ("discount pending approval", from the generic notify_discount_request_trg)',
        '  was worded as a discount but linked to the document, duplicating the two',
        '  real ones (approve the PO / approve its discount).',
        '- The generic trigger now skips purchase_order and sales_order, which have a',
        '  dedicated discount notification pointing at the approvals inbox. Other',
        '  document types keep the generic trigger unchanged.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.691 pushed - one notification per concern on PO/SO discounts" -ForegroundColor Green
}
