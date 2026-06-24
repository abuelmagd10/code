$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.325.ps1") { Remove-Item -LiteralPath "push_v3.74.325.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.326"') {
    Write-Host "+ 3.74.326" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Migration
$mig = "supabase/migrations/20260624000326_v3_74_326_activate_booking_atomic.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'CREATE OR REPLACE FUNCTION public.activate_booking_atomic',
    'Fast-forward to in_progress',
    'complete_booking_atomic',
    'current_responsible_user_id'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: activate_booking_atomic wired" -ForegroundColor Green

# API endpoint
$api = "app/api/bookings/[id]/activate/route.ts"
if (-not (Test-Path -LiteralPath $api)) {
    Write-Host "X activate route missing" -ForegroundColor Red; exit 1
}
$apiBody = Get-Content -LiteralPath $api -Raw
foreach ($n in @(
    'POST /api/bookings/[id]/activate',
    "supabase.rpc('activate_booking_atomic'",
    'أمر الحجز ده مفعّل بالفعل',
    'أمر الحجز ده ملغى'
)) {
    if ($apiBody -notmatch [regex]::Escape($n)) {
        Write-Host "X activate route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ activate route: friendly errors + RPC dispatch" -ForegroundColor Green

# BookingsTab activate button
$tab = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'v3.74.326 — per-row activation spinner',
    'handleActivate',
    '/activate',
    'تفعيل وإنشاء فاتورة',
    'يتم تسجيلك كمسؤول التفعيل'
)) {
    if ($tab -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: activate button wired" -ForegroundColor Green

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

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_326.txt"
    $msgLines = @(
        'feat(bookings): v3.74.326 - one-click "تفعيل" with audit trail',
        '',
        'Closing migration of the unified booking-orders rollout',
        '(324 -> 325 -> 326). Adds the "تفعيل" button the owner asked',
        'for: from anywhere in the booking lifecycle except the terminal',
        'states, an authorised staff member presses one button and the',
        'system advances the booking to completed AND generates the',
        'invoice in the same transaction.',
        '',
        'NEW DB function: activate_booking_atomic',
        '   Locks the row, validates the source status, fast-forwards',
        '   through confirmed/started while backfilling the audit',
        '   timestamps to the activator, then delegates to',
        '   complete_booking_atomic so the invoice + journal logic is',
        '   reused verbatim. Finally promotes',
        '   current_responsible_user_id from NULL to the activator if',
        '   no one was assigned (the "open queue" booking just picked',
        '   up its owner of record).',
        '   Rejected source states: completed / cancelled / no_show.',
        '',
        'NEW API route: POST /api/bookings/[id]/activate',
        '   Thin controller around the RPC. Returns friendly 409',
        '   messages for the terminal states instead of letting the',
        '   raw P0001 leak to the UI. Reuses the existing booking-',
        '   completed notification so the accountant sees the same',
        '   heads-up as a /complete flow would produce.',
        '',
        'CHANGED: components/sales-orders/BookingsTab.tsx',
        '   Added a green Activate button next to the eye-icon for any',
        '   non-terminal booking. confirm() prompt explains exactly what',
        '   will happen (completed + auto-invoice + activator stamp).',
        '   Per-row spinner while the call is in flight. Toasts surface',
        '   the generated invoice number on success and the server-',
        '   provided error otherwise.',
        '',
        'Calendar users navigating the booking detail page still go',
        'through confirm -> start -> complete one at a time. That flow',
        'is intentionally untouched. activate is purely the orders-',
        'inbox shortcut.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000326_v3_74_326_activate_booking_atomic.sql (NEW)',
        '  app/api/bookings/[id]/activate/route.ts (NEW)',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.326'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.326 pushed" -ForegroundColor Green
}
