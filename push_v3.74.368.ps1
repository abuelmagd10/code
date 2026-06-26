$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.367.ps1") { Remove-Item -LiteralPath "push_v3.74.367.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.368"') {
    Write-Host "+ 3.74.368" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260626000368_v3_74_368_booking_notes_table.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration: booking_notes table" -ForegroundColor Green
} else { Write-Host "X missing migration" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "app/api/bookings/[id]/notes/route.ts")) {
    Write-Host "X missing notes route" -ForegroundColor Red; exit 1
}
Write-Host "+ API route: /api/bookings/[id]/notes" -ForegroundColor Green

if (-not (Test-Path -LiteralPath "components/bookings/BookingNotes.tsx")) {
    Write-Host "X missing BookingNotes component" -ForegroundColor Red; exit 1
}
Write-Host "+ component: BookingNotes" -ForegroundColor Green

$bp = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
foreach ($n in @(
    'import { BookingNotes }',
    'TabsTrigger value="notes"',
    'TabsContent value="notes"',
    'v3.74.368'
)) {
    if ($bp -notmatch [regex]::Escape($n)) {
        Write-Host "X booking page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ booking page: Notes tab wired up" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_368.txt"
    $msgLines = @(
        'feat(bookings): v3.74.368 - per-booking execution notes',
        '',
        'Owner asked for a place where the executing staff can jot',
        'down free-text notes during the service (machine issue, what',
        'the customer changed at the last minute, follow-up reminders,',
        'etc.). Multiple notes per booking, time-stamped, author shown.',
        '',
        'DB',
        '  booking_notes (id, booking_id, company_id, user_id, body,',
        '  created_at). RLS:',
        '    - SELECT: any company member (company-membership check,',
        '              same pattern as the other booking-child tables).',
        '    - INSERT: any active company member, user_id must be self.',
        '    - DELETE: author OR owner / admin / general_manager.',
        '',
        'API',
        '  GET    /api/bookings/[id]/notes - newest first, enriched',
        '         with author_name (HR full name -> profile display ->',
        '         username -> email).',
        '  POST   /api/bookings/[id]/notes - append a note (validates',
        '         non-empty + max 2000 chars).',
        '  DELETE /api/bookings/[id]/notes?note_id=... - remove one.',
        '',
        'UI',
        '  - New "ملاحظات" tab on /bookings/[id] between Timeline and',
        '    Rating.',
        '  - BookingNotes component: textarea + send button on top, a',
        '    chronological feed underneath (avatar, name, timestamp,',
        '    body, delete icon).',
        '  - canAdd=false when booking is cancelled / no_show so old',
        '    threads stay read-only.',
        '',
        'Files',
        '  supabase/migrations/20260626000368_v3_74_368_booking_notes_table.sql',
        '  app/api/bookings/[id]/notes/route.ts (new)',
        '  components/bookings/BookingNotes.tsx (new)',
        '  app/bookings/[id]/page.tsx',
        '  lib/version.ts -> 3.74.368'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.368 pushed" -ForegroundColor Green
}
