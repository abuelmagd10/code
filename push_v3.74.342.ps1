$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.341.ps1") { Remove-Item -LiteralPath "push_v3.74.341.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.342"') {
    Write-Host "+ 3.74.342" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000342_v3_74_342_service_commission_columns.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'ADD COLUMN IF NOT EXISTS source     TEXT',
        'ADD COLUMN IF NOT EXISTS booking_id UUID',
        'ux_user_bonuses_booking_active'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: user_bonuses.source + booking_id + unique index" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

# ---- service file ------------------------------------------------------------
$svc = "lib/services/service-commission-calculator.service.ts"
if (Test-Path $svc) {
    $svcText = Get-Content -LiteralPath $svc -Raw
    foreach ($n in @(
        'export async function recordServiceCommissionForInvoice',
        'export async function reverseServiceCommissionForInvoice',
        "source:           'service_commission'",
        "bonus_type:       'percentage'"
    )) {
        if ($svcText -notmatch [regex]::Escape($n)) {
            Write-Host "X service file missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ service file: record + reverse functions" -ForegroundColor Green
} else { Write-Host "X missing service file" -ForegroundColor Red; exit 1 }

# ---- payment hook ------------------------------------------------------------
$pay = Get-Content -LiteralPath "lib/services/sales-invoice-payment-command.service.ts" -Raw
foreach ($n in @(
    'v3.74.342 — Service commission hook',
    'recordServiceCommissionForInvoice',
    '[ServiceCommission] Recorded for invoice'
)) {
    if ($pay -notmatch [regex]::Escape($n)) {
        Write-Host "X payment hook missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ payment hook wired in sales-invoice-payment-command" -ForegroundColor Green

# ---- activation hook ---------------------------------------------------------
$act = Get-Content -LiteralPath "app/api/bookings/[id]/activate/route.ts" -Raw
foreach ($n in @(
    'v3.74.342 — Service commission hook for the "paid on activation"',
    'recordServiceCommissionForInvoice',
    "invoiceCheck?.status === 'paid'"
)) {
    if ($act -notmatch [regex]::Escape($n)) {
        Write-Host "X activation hook missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ activation hook wired in /api/bookings/[id]/activate" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_342.txt"
    $msgLines = @(
        'feat(services): v3.74.342 - service commission flows into payroll',
        '',
        'Owner noticed services.commission_rate was sitting unused on the',
        'service form. The decision: make it behave exactly like the sales',
        'bonus pipeline so the executor of a booking earns their cut on the',
        'same payslip mechanism.',
        '',
        'Captured choices (from the owner):',
        '  * base       = invoice subtotal (excludes VAT)',
        '  * trigger    = once, when the invoice transitions to paid',
        '  * recipient  = bookings.current_responsible_user_id (fallback',
        '                 staff_user_id); the whole amount goes to that one',
        '                 person',
        '  * reversal   = automatic on invoice void/refund',
        '',
        'Schema (user_bonuses):',
        '  + source     TEXT      discriminator; backfilled to ''sales''',
        '  + booking_id UUID      FK to bookings; NULL for sales',
        '  + UNIQUE (company_id, booking_id) WHERE status not in reversed,cancelled',
        '',
        'New service file:',
        '  lib/services/service-commission-calculator.service.ts',
        '    - recordServiceCommissionForInvoice(...)',
        '    - reverseServiceCommissionForInvoice(...)',
        '  Both swallow 23505 as ''already_recorded'' so retries are safe.',
        '',
        'Wired hooks (defense in depth, both idempotent):',
        '  1. sales-invoice-payment-command.service — when an invoice is',
        '     marked fully paid via the standard payment flow. Mirrors the',
        '     existing bonus hook''s position so nothing reorders.',
        '  2. /api/bookings/[id]/activate route — for the "born paid" case',
        '     where complete_booking_atomic stamps the invoice paid because',
        '     the booking''s paid_amount already covered the total. We only',
        '     re-check after a successful RPC and only fire if the invoice',
        '     is actually paid; the unique index makes a double-fire a',
        '     no-op.',
        '',
        'Files',
        '  supabase/migrations/20260624000342_v3_74_342_service_commission_columns.sql',
        '  lib/services/service-commission-calculator.service.ts',
        '  lib/services/sales-invoice-payment-command.service.ts',
        '  app/api/bookings/[id]/activate/route.ts',
        '  lib/version.ts -> 3.74.342'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.342 pushed" -ForegroundColor Green
}
