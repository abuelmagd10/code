$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.380.ps1") { Remove-Item -LiteralPath "push_v3.74.380.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.381"') {
    Write-Host "+ 3.74.381" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260628000381_v3_74_381_create_seat_licenses_on_purchase.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 381" -ForegroundColor Green
} else { Write-Host "X missing migration 381" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'create_seat_licenses_for_purchase',
    'pg_advisory_xact_lock',
    'billing_invoice_id',
    'seat_licenses_created',
    "INTERVAL '1 month'",
    "INTERVAL '1 year'"
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers RPC + idempotency + audit log" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/billing/seat-service.ts" -Raw
if ($svc -notmatch "createSeatLicensesForPurchase") {
    Write-Host "X seat-service missing createSeatLicensesForPurchase helper" -ForegroundColor Red; exit 1
}
Write-Host "+ seat-service exports createSeatLicensesForPurchase" -ForegroundColor Green

$sub = Get-Content -LiteralPath "lib/billing/subscription-service.ts" -Raw
if ($sub -notmatch "createSeatLicensesForPurchase") {
    Write-Host "X subscription-service does not call the new helper after invoice" -ForegroundColor Red; exit 1
}
if ($sub -notmatch "invoiceId = invoiceResult.invoiceId") {
    Write-Host "X subscription-service does not capture invoiceId for dedup" -ForegroundColor Red; exit 1
}
Write-Host "+ webhook path wires per-seat licenses with billing_invoice_id" -ForegroundColor Green

$route = Get-Content -LiteralPath "app/api/billing/seats/route.ts" -Raw
if ($route -notmatch "createSeatLicensesForPurchase") {
    Write-Host "X /api/billing/seats free-grant path does not create licenses" -ForegroundColor Red; exit 1
}
Write-Host "+ free-grant path wires per-seat licenses" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_381.txt"
    $msgLines = @(
        'feat(seats): v3.74.381 - per-seat license on purchase (Stage 4 of 6)',
        '',
        'Stage 4 of the seat-license rollout: the buy-seats flow now',
        'creates one row in company_seat_licenses for every seat that',
        'gets purchased, each with its own purchased_at + expires_at.',
        'The legacy increase_seats RPC keeps doing its existing job',
        'so every screen that still reads the old total_paid_seats',
        'counter keeps working.',
        '',
        'DB',
        '  function create_seat_licenses_for_purchase(',
        '    company_id, seats_count, billing_period, billing_invoice_id)',
        '    - advisory lock per company (no concurrent allocations)',
        '    - dedup on billing_invoice_id: re-fired webhook is a no-op',
        '    - allocates seat_numbers as MAX(seat_number)+1..+N',
        '    - purchased_at = NOW()',
        '    - expires_at   = NOW() + 1 month (or + 1 year for annual)',
        '    - audit log entry action=seat_licenses_created with first/',
        '      last seat numbers and license_ids',
        '',
        'Service / API wiring',
        '  lib/billing/seat-service.ts',
        '    + new helper createSeatLicensesForPurchase that wraps the',
        '      RPC and returns a typed result',
        '  lib/billing/subscription-service.ts (Paymob webhook path)',
        '    - captures invoiceId from createInvoiceForPayment',
        '    - calls createSeatLicensesForPurchase with that invoiceId',
        '      AFTER the invoice exists so the dedup key is set',
        '    - license-creation failure is non-blocking (does not undo',
        '      seat increase or invoice generation)',
        '  app/api/billing/seats/route.ts (free-grant coupon path)',
        '    - calls createSeatLicensesForPurchase with NULL invoice id',
        '      (no Paymob payment was made); the synthetic txn id keeps',
        '      duplicate creation impossible because the request is',
        '      one-shot inside the route',
        '',
        'Behavior after this stage',
        '  - Owner buys 5 seats -> company_seats.total_paid_seats += 5',
        '    AND 5 new rows in company_seat_licenses with the same',
        '    purchased_at + expires_at',
        '  - Owner buys 1 seat next month -> 1 new row with new dates,',
        '    keeping its own lifecycle independent of the earlier 5',
        '  - The /settings/seats page (Stage 2) already renders each',
        '    row with its own dates; staged purchases now actually',
        '    produce them',
        '',
        'Remaining stages',
        '  v3.74.382 - renewal flow (one / many / all expired)',
        '  v3.74.383 - invitation flow + suspended page polish',
        '',
        'Files',
        '  supabase/migrations/20260628000381_v3_74_381_create_seat_licenses_on_purchase.sql',
        '  lib/billing/seat-service.ts',
        '  lib/billing/subscription-service.ts',
        '  app/api/billing/seats/route.ts',
        '  lib/version.ts -> 3.74.381',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.381 pushed - per-seat licenses on purchase" -ForegroundColor Green
}
