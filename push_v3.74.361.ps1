$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.360.ps1") { Remove-Item -LiteralPath "push_v3.74.360.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.361"') {
    Write-Host "+ 3.74.361" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260625000361_v3_74_361_booking_multi_staff.sql"
if (Test-Path -LiteralPath $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE TABLE IF NOT EXISTS public.booking_staff_assignments',
        'UNIQUE (booking_id, user_id)',
        'p_staff_user_ids      uuid[]   DEFAULT NULL',
        'assigned_staff_user_ids',
        'assigned_staff_names'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: assignments table + RPC + view" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "lib/services/booking-api.ts" -Raw
if ($ba -notmatch 'staff_user_ids: z.array\(uuidSchema\)') {
    Write-Host "X createBookingSchema missing staff_user_ids array" -ForegroundColor Red; exit 1
}
Write-Host "+ Zod schema: staff_user_ids array" -ForegroundColor Green

$post = Get-Content -LiteralPath "app/api/bookings/route.ts" -Raw
foreach ($n in @(
    'v3.74.361 — multi-staff: prefer staff_user_ids',
    'p_staff_user_ids:      effectiveIds'
)) {
    if ($post -notmatch [regex]::Escape($n)) {
        Write-Host "X POST /api/bookings missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ POST /api/bookings: forwards staff_user_ids[] to RPC" -ForegroundColor Green

$patch = Get-Content -LiteralPath "app/api/bookings/[id]/route.ts" -Raw
foreach ($n in @(
    'v3.74.361 — multi-staff edit',
    'staff_user_ids:  z.array(z.string().uuid()).nullable().optional()',
    'v3.74.361 — REPLACE the assignments set',
    "from('booking_staff_assignments')"
)) {
    if ($patch -notmatch [regex]::Escape($n)) {
        Write-Host "X PATCH /api/bookings/[id] missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ PATCH /api/bookings/[id]: replaces assignments on save" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_361.txt"
    $msgLines = @(
        'feat(bookings): v3.74.361 - multi-staff bookings (DB + API)',
        '',
        'Stage 1 of the owner-confirmed booking rules:',
        '  * Owner / general_manager / branch manager attach 1+ staff',
        '    to a service.',
        '  * Booking officer picks 0, 1, or many of those staff on a',
        '    booking. 0 = open queue (anyone linked to the service).',
        '',
        'DB',
        '  - New junction table booking_staff_assignments (booking_id,',
        '    user_id) with RLS scoped to company members.',
        '  - bookings.staff_user_id is kept as a legacy mirror = first',
        '    assigned user. Existing rows are backfilled into the new',
        '    junction table.',
        '  - create_booking_atomic now takes p_staff_user_ids uuid[] as',
        '    a new trailing argument. Legacy p_staff_user_id still',
        '    works (treated as a single-element array).',
        '  - v_bookings_full exposes assigned_staff_user_ids[] and',
        '    assigned_staff_names[] so the UI can render the full list',
        '    without a second round trip.',
        '',
        'API',
        '  - createBookingSchema gains staff_user_ids: z.array(uuid).',
        '    POST /api/bookings forwards it to the RPC. If both legacy',
        '    and array fields are sent, the array wins.',
        '  - PATCH /api/bookings/[id] accepts staff_user_ids and',
        '    REPLACES the assignments set on save (owner-confirmed:',
        '    "remove ahmed, add khaled + samy" wipes ahmed). Empty',
        '    array = "open queue".',
        '',
        'Out of scope for this stage',
        '  - BookingForm UI multi-select picker (next: v3.74.362).',
        '  - BookingsTab visibility + execute-button rules (v3.74.363).',
        '  - Commission skip when owner / general_manager executes',
        '    (v3.74.363).',
        '',
        'Files',
        '  supabase/migrations/20260625000361_v3_74_361_booking_multi_staff.sql',
        '  lib/services/booking-api.ts',
        '  app/api/bookings/route.ts',
        '  app/api/bookings/[id]/route.ts',
        '  lib/version.ts -> 3.74.361'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.361 pushed" -ForegroundColor Green
}
