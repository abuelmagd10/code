$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.361.ps1") { Remove-Item -LiteralPath "push_v3.74.361.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.363"') {
    Write-Host "+ 3.74.363" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
foreach ($n in @(
    'import { MultiSelect } from "@/components/ui/multi-select"',
    'v3.74.362 — Staff picker is now a multi-select',
    'name={"staff_user_ids" as any}',
    'staff_user_ids:      []'
)) {
    if ($bf -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingForm: multi-select staff" -ForegroundColor Green

$edit = Get-Content -LiteralPath "app/bookings/[id]/edit/page.tsx" -Raw
foreach ($n in @(
    'import { MultiSelect } from "@/components/ui/multi-select"',
    'const [staffUserIds, setStaffUserIds]',
    'body.staff_user_ids = staffUserIds'
)) {
    if ($edit -notmatch [regex]::Escape($n)) {
        Write-Host "X edit page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ edit page: multi-select staff" -ForegroundColor Green

$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'v3.74.362 — multi-staff assignments from v_bookings_full',
    'r.assigned_staff_user_ids',
    'assignments.includes(myId)'
)) {
    if ($bt -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: canExecuteRow uses assignments" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/services/service-commission-calculator.service.ts" -Raw
foreach ($n in @(
    'v3.74.363 — Owner-confirmed rule',
    "'executed_by_owner_or_admin'",
    "['owner', 'admin', 'general_manager'].includes(execRole)"
)) {
    if ($svc -notmatch [regex]::Escape($n)) {
        Write-Host "X commission service missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ commission: owner/admin executor skipped" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_363.txt"
    $msgLines = @(
        'feat(bookings): v3.74.362/3 - multi-staff UI + commission owner-skip',
        '',
        'Stage 2 (v3.74.362):',
        '  * BookingForm staff picker switched from single Select to a',
        '    MultiSelect. The user can pick 0, 1, or many of the staff',
        '    linked to the chosen service. Empty pick still means open',
        '    queue. staff_user_id is kept in sync as the first picked',
        '    id (legacy mirror).',
        '  * /bookings/[id]/edit edit page uses the same MultiSelect and',
        '    only sends staff_user_ids to the PATCH endpoint when the',
        '    set actually changed - the route REPLACES the assignments',
        '    set on every save (owner-confirmed rule).',
        '  * BookingsTab in /sales-orders:',
        '      - canExecuteRow now reads assigned_staff_user_ids first,',
        '        falling back to the legacy staff_user_id. Owner +',
        '        general_manager keep the override. Open-queue bookings',
        '        stay open.',
        '      - Staff column shows the first assigned name and a "+N"',
        '        when more than one staff is assigned (tooltip lists all).',
        '',
        'Stage 3 (v3.74.363):',
        '  * Service commission calculator: when the executor on',
        '    current_responsible_user_id is owner / admin / general_',
        '    manager, NO commission is recorded for anyone. Owner-',
        '    confirmed rule: their hits are oversight overrides, not',
        '    billable service work.',
        '',
        'Files',
        '  components/bookings/BookingForm.tsx',
        '  app/bookings/[id]/edit/page.tsx',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/services/service-commission-calculator.service.ts',
        '  lib/version.ts -> 3.74.363'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.363 pushed" -ForegroundColor Green
}
