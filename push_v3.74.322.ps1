$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.321.ps1") { Remove-Item -LiteralPath "push_v3.74.321.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.322"') {
    Write-Host "+ 3.74.322" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Migration
$mig = "supabase/migrations/20260624000322_v3_74_322_complete_booking_branch_aware_cost_center.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'branch-aware cost-center cascade',
    'v_branch.default_cost_center_id'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: complete_booking_atomic branch-aware cost center" -ForegroundColor Green

# availability route
$av = Get-Content -LiteralPath "app/api/bookings/availability/route.ts" -Raw
foreach ($n in @(
    'v3.74.322 — Branch-aware capacity check',
    "sp.get('branch_id')",
    "throw new BookingApiError(400, 'branch_id مطلوب",
    ".eq('branch_id', branchId)"
)) {
    if ($av -notmatch [regex]::Escape($n)) {
        Write-Host "X availability route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ availability route: scoped to branch_id" -ForegroundColor Green

# AvailabilityChecker
$ac = Get-Content -LiteralPath "components/bookings/AvailabilityChecker.tsx" -Raw
foreach ($n in @(
    'branchId:     string | null',
    'branch_id: branchId',
    'اختر الفرع أولاً'
)) {
    if ($ac -notmatch [regex]::Escape($n)) {
        Write-Host "X AvailabilityChecker missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ AvailabilityChecker: passes branchId" -ForegroundColor Green

# BookingForm
$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
foreach ($n in @(
    'watchedBranchId',
    'branchId={watchedBranchId'
)) {
    if ($bf -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingForm: branch wired into checker" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_322.txt"
    $msgLines = @(
        'fix(bookings+services): v3.74.322 - per-branch capacity + cost center',
        '',
        'Two high-priority gaps surfaced by the post-v3.74.319 audit of',
        'the shared-services (branch_id NULL) change. Both could quietly',
        'corrupt operational and accounting reality once a tenant',
        'actually started booking against a shared service.',
        '',
        '1) Availability now scoped per branch',
        '   app/api/bookings/availability/route.ts used to count all',
        '   bookings for service_id across the whole company. A shared',
        '   service with capacity 2 would block its second slot the',
        '   moment any branch booked one — even though the other',
        '   booking is in a different physical location.',
        '   Branch is now a required query param. The bookings filter',
        '   adds .eq("branch_id", branchId), and the React',
        '   AvailabilityChecker takes branchId as a required prop and',
        '   shows "اختر الفرع أولاً" until it is set.',
        '   BookingForm now watches "branch_id" and pipes it through.',
        '',
        '2) Cost-center fallback in complete_booking_atomic',
        '   The old fallback ran an unordered LIMIT 1 over cost_centers',
        '   whenever both the booking and the service had no explicit',
        '   cost_center. With shared services, every branch posted to',
        '   the same arbitrary "first" cost center — silent cross-',
        '   branch contamination of management accounts.',
        '   New cascade:',
        '     1. v_booking.cost_center_id',
        '     2. v_service.cost_center_id',
        '     3. v_branch.default_cost_center_id  (NEW)',
        '     4. cost_centers LIMIT 1            (last resort)',
        '   The branch default already exists on the branches table,',
        '   so this is purely a function-body change.',
        '',
        'Migration applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000322_v3_74_322_complete_booking_branch_aware_cost_center.sql (NEW)',
        '  app/api/bookings/availability/route.ts',
        '  components/bookings/AvailabilityChecker.tsx',
        '  components/bookings/BookingForm.tsx',
        '  lib/version.ts -> 3.74.322'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.322 pushed" -ForegroundColor Green
}
