$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.336.ps1") { Remove-Item -LiteralPath "push_v3.74.336.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.337"') {
    Write-Host "+ 3.74.337" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
foreach ($n in @(
    'v3.74.337 — staff list for THIS service',
    'serviceStaffIds',
    'isFloatingBookingOfficer',
    'visibleServices',
    'v3.74.337 — Staff dropdown follows the golden rule',
    'الخدمة محدد لها موظفون',
    'الخدمة بدون موظفين محددين',
    "Pick a branch to see its services"
)) {
    if ($bf -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingForm: service-staff filter + floating-officer flow" -ForegroundColor Green

# SimpleStaff carries branch_id
$bnp = Get-Content -LiteralPath "app/bookings/new/page.tsx" -Raw
if ($bnp -notmatch [regex]::Escape('v3.74.337 — needed so BookingForm can fall back')) {
    Write-Host "X bookings/new page: SimpleStaff missing branch_id" -ForegroundColor Red; exit 1
}
Write-Host "+ bookings/new page: SimpleStaff includes branch_id" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_337.txt"
    $msgLines = @(
        'feat(bookings): v3.74.337 - service-staff filter + floating-officer flow',
        '',
        'Two interlinked UX rules the owner spelled out for /bookings/new:',
        '',
        '1) Staff dropdown follows the golden rule of the service',
        '   - If the chosen service has assigned staff (service_staff',
        '     rows), only those names appear in the picker.',
        '   - If the service has NO assigned staff, every employee in',
        '     that service''s branch appears (the open-queue case).',
        '   The component fetches /api/services/[id]/staff every time',
        '   the service selection changes, stores the user_ids in',
        '   serviceStaffIds, and builds the filtered list client-side.',
        '   A short Arabic hint under the dropdown explains which mode',
        '   is active so the operator knows why a colleague isn''t',
        '   listed. The picker is disabled while no service is chosen',
        '   or the staff list is still loading.',
        '',
        '2) Floating booking_officer flow',
        '   A booking_officer with no branch_id (the "بدون فرع" pattern',
        '   wired up in v3.74.329) can serve every branch. The form now',
        '   exposes an extra Branch dropdown above the rest for that',
        '   role only. Picking a branch:',
        '     - filters the Service dropdown to that branch (client-side',
        '       on services.branch_id),',
        '     - clears any previously chosen service so the booking is',
        '       not left pointing at a service from another branch,',
        '     - cascades through to the staff filter via the existing',
        '       service-select effect.',
        '   Other roles do not see the branch dropdown; their branch is',
        '   the service''s branch by definition.',
        '',
        'Supporting changes',
        '   - SimpleStaff in /bookings/new gains branch_id so the staff',
        '     fallback "every employee in the service branch" can work.',
        '     The /api/company-members endpoint already returns it.',
        '   - SimpleStaff in BookingForm.tsx gains branch_id too.',
        '   - Imports: lucide MapPin, lib/access-context useAccess.',
        '',
        'No DB migration. service_staff, services.branch_id and',
        'company_members.branch_id all already carry the data we need.',
        'The RLS on bookings has NOT been touched yet — that lives in',
        'v3.74.338 (the order-of-booking-appearance rule the owner',
        'flagged as the most sensitive).',
        '',
        'Files',
        '  components/bookings/BookingForm.tsx',
        '  app/bookings/new/page.tsx',
        '  lib/version.ts -> 3.74.337'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.337 pushed" -ForegroundColor Green
}
