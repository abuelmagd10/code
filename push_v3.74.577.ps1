$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.576.ps1") { Remove-Item -LiteralPath "push_v3.74.576.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.577"') {
    Write-Host "+ 3.74.577" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$addons = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($addons -notmatch "mayEdit" -or $addons -notmatch "bookingBranchId" -or $addons -notmatch "readOnly") {
    Write-Host "X BookingAddons governance gate missing" -ForegroundColor Red; exit 1
}
$page = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($page -notmatch "assignedStaffUserIds=\{\(booking as any\)\.assigned_staff_user_ids") {
    Write-Host "X booking page not passing governance props to BookingAddons" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260707000577_v3_74_577_booking_addons_governance.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ booking addons governance (UI gate + migration mirror)" -ForegroundColor Green

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
    "components/bookings/BookingAddons.tsx" `
    "app/bookings/[id]/page.tsx" `
    "supabase/migrations/20260707000577_v3_74_577_booking_addons_governance.sql" `
    "lib/version.ts" `
    "push_v3.74.577.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.576.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_577.txt"
    $msgLines = @(
        'feat(bookings): v3.74.577 - addons governance + staff-from-service rule',
        '',
        'Continues the bundle/walk-in extras work (v3.74.573/574).',
        'Comprehensive review answered the open governance question from',
        'the DB itself: the assigned service employee has role "staff"',
        '(bookings: read+update, no write/delete).',
        '',
        'Server (migration 20260707000577, already live via MCP):',
        '- assert_booking_addons_permission(): the 4 addon RPCs now allow',
        '  only owner/admin/general_manager, booking_officer within his',
        '  branch (unbranched officer = any branch), and the staff member',
        '  assigned to that specific booking (staff_user_id or',
        '  booking_staff_assignments). Everyone else gets a clear Arabic',
        '  rejection. selected_by/added_by now pinned to auth.uid() so the',
        '  audit trail cannot be spoofed from the client.',
        '- booking_staff_from_service_trg: a booking''s staff must be one',
        '  of the employees registered on the service (service_staff,',
        '  branch-scoped). Services with no registered staff keep free',
        '  choice. Fires only when staff/service actually changes, so',
        '  status flows (confirm/start/complete) are untouched.',
        '',
        'UI:',
        '- BookingAddons mirrors the same rule: controls hidden for',
        '  unauthorized roles with a view-only notice; server remains the',
        '  real gate.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.577 pushed - booking addons governance live" -ForegroundColor Green
}
