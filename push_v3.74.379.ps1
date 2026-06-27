$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.378.ps1") { Remove-Item -LiteralPath "push_v3.74.378.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.379"') {
    Write-Host "+ 3.74.379" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260627000379_v3_74_379_seat_swap_per_license.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 379" -ForegroundColor Green
} else { Write-Host "X missing migration 379" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'swap_seat_numbers',
    'p_actor_user_id',
    'company_seat_licenses',
    'assigned_user_id',
    'get_user_company_status',
    'seat_expires_at',
    "NOT v_is_owner AND v_seat_suspended"
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers swap rewrite + status RPC update" -ForegroundColor Green

$swap = Get-Content -LiteralPath "app/api/billing/seats/swap/route.ts" -Raw
if ($swap -notmatch 'p_actor_user_id') {
    Write-Host "X swap route does not pass actor user_id" -ForegroundColor Red; exit 1
}
Write-Host "+ swap route passes actor user_id" -ForegroundColor Green

$susp = Get-Content -LiteralPath "app/suspended/page.tsx" -Raw
foreach ($n in @(
    'seat_expires_at',
    'انتهت صلاحية مقعدك',
    'لم يتم إسناد مقعد لك بعد'
)) {
    if ($susp -notmatch [regex]::Escape($n)) {
        Write-Host "X suspended page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ suspended page updated for per-seat semantics" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_379.txt"
    $msgLines = @(
        'feat(seats): v3.74.379 - per-license swap + suspension (Stage 3 of 6)',
        '',
        'The big behavioural switch. Until this version:',
        '  - swap_seat_numbers swapped the SEAT NUMBER on members',
        '    (the seat moved, the user stayed put)',
        '  - get_user_company_status decided suspension by comparing',
        '    seat_number to company_seats.total_paid_seats',
        '  - subscription_status=payment_failed blocked every',
        '    non-owner in the company',
        '',
        'After this version:',
        '  - swap_seat_numbers moves the user attachment between',
        '    two seat licenses (the seat stays, the user moves)',
        '  - get_user_company_status looks up the user''s attached',
        '    seat license and checks expires_at to decide blocking',
        '  - subscription_status is surfaced but does NOT gate.',
        '    The seat license dates rule.',
        '',
        'Net effect for the owner''s test company on apply:',
        '  Seats 1-4 employees: blocked (their licenses expired)',
        '  Seat 5 employee:     ALLOWED (license valid until Jun 28)',
        '                       was previously blocked by the',
        '                       company-wide payment_failed flag',
        '  Owner:               unaffected (no license required)',
        '',
        'DB',
        '  swap_seat_numbers(company, seat_a, seat_b, actor)',
        '    - drops the owner-seat (0) participation',
        '    - resolves licenses by (company, seat_number)',
        '    - both seats must be real licenses (rejects with',
        '      license_not_found if either is missing)',
        '    - rejects with both_seats_empty when neither has an',
        '      occupant',
        '    - nullifies one side first to avoid the partial unique',
        '      (company, assigned_user_id) constraint',
        '    - mirrors the move into company_members.seat_number to',
        '      keep legacy screens consistent until Stage 6',
        '    - audit_logs row with action=seat_swap and a payload of',
        '      actor + before/after users + license ids',
        '  get_user_company_status(user)',
        '    - reads company_seat_licenses for the attached license',
        '    - is_seat_suspended = (no license) OR (license expired)',
        '    - is_suspended = (NOT is_owner AND is_seat_suspended)',
        '    - keeps is_company_suspended in the response for any',
        '      legacy caller that reads it directly',
        '    - exposes seat_expires_at for the /suspended page',
        '',
        'API',
        '  POST /api/billing/seats/swap',
        '    - passes the authenticated user id to the RPC so the',
        '      audit log records who initiated the swap',
        '',
        'UI',
        '  /suspended',
        '    - three message variants now:',
        '      * seat expired: "مقعدك رقم #X انتهت صلاحيته فى TARIKH"',
        '      * no seat assigned: "لم يتم إسناد مقعد لك بعد"',
        '      * company-wide: legacy renewal-required message',
        '    - The first variant pulls the exact expiry date from',
        '      get_user_company_status.seat_expires_at',
        '',
        'Next stages',
        '  v3.74.380 - buying creates per-seat licenses',
        '  v3.74.381 - renewal flow',
        '  v3.74.382 - invitation flow + suspended page polish',
        '',
        'Files',
        '  supabase/migrations/20260627000379_v3_74_379_seat_swap_per_license.sql',
        '  app/api/billing/seats/swap/route.ts',
        '  app/suspended/page.tsx',
        '  lib/version.ts -> 3.74.379',
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
    Write-Host "`n+ v3.74.379 pushed - swap + suspension now per-license" -ForegroundColor Green
}
