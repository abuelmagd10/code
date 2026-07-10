$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.595.ps1") { Remove-Item -LiteralPath "push_v3.74.595.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.596"') {
    Write-Host "+ 3.74.596" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260710000596_v3_74_596_onsite_pickup_for_booking_invoices.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ onsite-pickup delivery option migration mirrored" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "supabase/migrations/20260710000596_v3_74_596_onsite_pickup_for_booking_invoices.sql" `
    "lib/version.ts" `
    "push_v3.74.596.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.595.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_596.txt"
    $msgLines = @(
        'feat(bookings): v3.74.596 - onsite-pickup delivery method for booking invoices',
        '',
        'Owner clarified the system philosophy (settings/shipping docs):',
        'shipping provider = DELIVERY METHOD (courier / on-site pickup /',
        'internal courier), mandatory on sales invoices. Booking-generated',
        'invoices carried NULL - technically harmless (posting treats it',
        'as optional, dispatch has an explicit no-shipment path, third-',
        'party inventory only tracks courier shipments) but inconsistent',
        'with the rule and confusing for the accountant.',
        '',
        'DB (migration 20260710000596, already live via MCP):',
        '- provider "استلام من الفرع" (code onsite_pickup, manual) auto-',
        '  seeded per company + mapped to all branches (respects the',
        '  branch_shipping_providers gate) + triggers for new companies',
        '  and new branches. Seeded: 4 companies, 5 branch mappings.',
        '- complete_booking_atomic stamps new booking invoices with it;',
        '  accountant can switch the DRAFT to a courier for delivery',
        '  cases (then the third-party cycle applies normally).',
        '- backfill: INV-2026-00001 stamped (verified).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.596 pushed - booking invoices carry a delivery method" -ForegroundColor Green
}
