$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.357.ps1") { Remove-Item -LiteralPath "push_v3.74.357.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.358"') {
    Write-Host "+ 3.74.358" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration present ------------------------------------------------------
$mig = "supabase/migrations/20260625000358_v3_74_358_confirm_booking_keeps_draft_status.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    if ($migText -notmatch 'CREATE OR REPLACE FUNCTION public\.confirm_booking_atomic') {
        Write-Host "X migration missing function body" -ForegroundColor Red; exit 1
    }
    if ($migText -match 'SET status = ''confirmed''') {
        Write-Host "X migration still mutates status to confirmed" -ForegroundColor Red; exit 1
    }
    Write-Host "+ migration: confirm keeps draft status" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

# ---- BookingActions has 3 buttons + confirmedAt prop ------------------------
$ba = Get-Content -LiteralPath "components/bookings/BookingActions.tsx" -Raw
foreach ($n in @(
    'v3.74.358 — Booking workflow simplified',
    'confirmedAt?:       string | null',
    'تأكيد الحجز',
    'تعديل الحجز',
    'إلغاء الحجز',
    'تم التأكيد'
)) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingActions missing: $n" -ForegroundColor Red; exit 1
    }
}
foreach ($oldKey in @('بدء الخدمة', 'إكمال وإصدار فاتورة', 'لم يحضر')) {
    if ($ba -match [regex]::Escape($oldKey)) {
        Write-Host "X BookingActions still contains removed button: $oldKey" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingActions: 3 buttons + confirmed badge" -ForegroundColor Green

# ---- Booking page passes confirmedAt ----------------------------------------
$bp = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($bp -notmatch 'confirmedAt=\{\(booking as any\)\.confirmed_at') {
    Write-Host "X booking page does not pass confirmedAt" -ForegroundColor Red; exit 1
}
Write-Host "+ booking page: confirmedAt prop forwarded" -ForegroundColor Green

# ---- BookingsTab renamed + filter ------------------------------------------
$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'v3.74.358 — simpler workflow',
    'v3.74.358 — booking tab in /sales-orders shows ONLY confirmed',
    'تنفيذ الخدمة',
    'Execute Service'
)) {
    if ($bt -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($bt -match '"تفعيل"') {
    Write-Host "X BookingsTab still ships the old "تفعيل" wording" -ForegroundColor Red; exit 1
}
Write-Host "+ BookingsTab: tab filter + execute label" -ForegroundColor Green

# ---- PATCH endpoint + edit page exist ---------------------------------------
$er = Get-Content -LiteralPath "app/api/bookings/[id]/route.ts" -Raw
foreach ($n in @(
    'v3.74.358 — schema for PATCH',
    'export async function PATCH'
)) {
    if ($er -notmatch [regex]::Escape($n)) {
        Write-Host "X bookings PATCH endpoint missing: $n" -ForegroundColor Red; exit 1
    }
}
if (-not (Test-Path -LiteralPath "app/bookings/[id]/edit/page.tsx")) {
    Write-Host "X edit page missing" -ForegroundColor Red; exit 1
}
Write-Host "+ PATCH endpoint + edit page" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_358.txt"
    $msgLines = @(
        'feat(bookings): v3.74.358 - new workflow stage 1 (3-button booking page)',
        '',
        'Stage 1 of the owner''s booking-workflow rewrite. Goal: the booking',
        'page shows three actions only, "تأكيد الحجز" stops changing status',
        'and just marks the booking as an "أمر حجز", and the sales-orders',
        'booking tab only shows confirmed bookings. Stage 2 (accounting',
        'rewrite) and stage 3 (extras on the order) follow.',
        '',
        'DB',
        '  confirm_booking_atomic now stamps confirmed_at and keeps',
        '  status = draft. The status enum is untouched so historical',
        '  rows still validate. Idempotent: a second click returns the',
        '  same confirmed_at without re-stamping.',
        '',
        'UI',
        '  BookingActions: three actions only -',
        '    * تأكيد الحجز  -> POST /api/bookings/:id/confirm',
        '    * تعديل الحجز  -> link to /bookings/:id/edit',
        '    * إلغاء الحجز  -> existing cancel endpoint',
        '  After confirmation a green "تم التأكيد" badge with the',
        '  timestamp replaces the confirm button. Start, complete and',
        '  no-show buttons are gone.',
        '',
        '  BookingsTab in /sales-orders:',
        '    * filters out bookings where confirmed_at IS NULL (those',
        '      live only on the booking page now)',
        '    * status filter simplified to draft / completed / cancelled',
        '    * "تفعيل" renamed to "تنفيذ الخدمة" (same RPC for stage 1)',
        '',
        'API',
        '  GET /api/bookings/[id] unchanged.',
        '  PATCH /api/bookings/[id] - new. Lets the owner edit a still-',
        '  draft, not-yet-executed booking: date, time, staff, qty,',
        '  discount, notes. Customer / service are intentionally not',
        '  editable; if you need that, cancel and create new.',
        '',
        'New page',
        '  /bookings/[id]/edit - light-weight form bound to the PATCH',
        '  endpoint. Read-only sections list the structural fields',
        '  (customer / service) that cannot be changed here.',
        '',
        'Files',
        '  supabase/migrations/20260625000358_v3_74_358_confirm_booking_keeps_draft_status.sql',
        '  components/bookings/BookingActions.tsx',
        '  app/bookings/[id]/page.tsx',
        '  components/sales-orders/BookingsTab.tsx',
        '  app/api/bookings/[id]/route.ts',
        '  app/bookings/[id]/edit/page.tsx (new)',
        '  lib/version.ts -> 3.74.358'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.358 pushed" -ForegroundColor Green
}
