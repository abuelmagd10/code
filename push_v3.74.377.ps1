$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.376.ps1") { Remove-Item -LiteralPath "push_v3.74.376.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.377"') {
    Write-Host "+ 3.74.377" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260627000377_v3_74_377_seat_licenses_foundation.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 377" -ForegroundColor Green
} else { Write-Host "X missing migration 377" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'company_seat_licenses',
    'backfill_company_seat_licenses',
    'get_user_seat_license',
    'company_seat_licenses_assigned_user_unique',
    "billing_period IN ('monthly', 'annual')",
    'Test-company staggered seed'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers table + helpers + seed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_377.txt"
    $msgLines = @(
        'feat(seats): v3.74.377 - per-seat license foundation (Stage 1 of 6)',
        '',
        'Owner asked to shift the seat model from "one subscription',
        'per company" to "one license per seat" so each seat can have',
        'its own purchase and expiry date. Stage 1 lands the DB',
        'foundation without changing any behavior - the middleware,',
        'the seats inbox, the suspension page, and the buy/checkout',
        'flow all still read from company_seats.total_paid_seats and',
        'company_members.seat_number. Later stages flip surfaces over',
        'one at a time.',
        '',
        'DB',
        '  new table company_seat_licenses',
        '    one row per purchased seat',
        '    columns: seat_number, billing_period, purchased_at,',
        '             expires_at, billing_invoice_id, last_renewed_at,',
        '             last_renewal_invoice_id, assigned_user_id,',
        '             assigned_at',
        '    UNIQUE (company_id, seat_number)',
        '    UNIQUE (company_id, assigned_user_id) WHERE assigned IS NOT NULL',
        '    indexes on company+seat, company+expires, assigned_user',
        '    updated_at trigger',
        '    RLS: company members can SELECT; no INSERT/UPDATE/DELETE',
        '         policies (service role + SECURITY DEFINER RPCs only)',
        '    owner seat 0 stays virtual - not in this table',
        '  function backfill_company_seat_licenses()',
        '    one-shot helper that seeds the new table from existing',
        '    company_seats.total_paid_seats + company_members.',
        '    seat_number. idempotent (NOT EXISTS guard on company,',
        '    seat_number).',
        '  function get_user_seat_license(user_id)',
        '    read helper Stages 2-6 will use to resolve a user to',
        '    their attached license.',
        '',
        'Backfill results at apply time',
        '  شركة تست      : 10 licenses (5 occupied, 5 empty)',
        '  توب تانك      : 1 license (occupied)',
        '  العصرية للنجارة: 0 (free tier)',
        '  notniche      : 0 (free tier)',
        '',
        'Test-company staggered seed',
        '  Migration also overrides شركة تست''s 10 seats with the',
        '  distribution the owner asked for so the upcoming stages',
        '  have realistic coverage:',
        '    Seat 1-4: expired (purchased mar..may, expired apr..jun)',
        '    Seat 5  : about to expire (active 1 day at apply time)',
        '    Seat 6-10: active with progressively longer windows',
        '  The UPDATE is a no-op on a fresh DB without شركة تست.',
        '',
        'Next stages',
        '  v3.74.378 - read-only UI shows per-seat dates',
        '  v3.74.379 - arrows move users between seats (new semantics)',
        '  v3.74.380 - buying creates per-seat licenses',
        '  v3.74.381 - renewal flow (one / many / all expired)',
        '  v3.74.382 - invitation flow + suspended page polish',
        '',
        'Files',
        '  supabase/migrations/20260627000377_v3_74_377_seat_licenses_foundation.sql',
        '  lib/version.ts -> 3.74.377',
        '',
        'Note',
        '  Migration + backfill + test seed applied to live DB via',
        '  Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.377 pushed - seat license foundation ready" -ForegroundColor Green
}
