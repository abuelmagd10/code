$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.366.ps1") { Remove-Item -LiteralPath "push_v3.74.366.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.367"') {
    Write-Host "+ 3.74.367" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# BookingActions has the new execute button + visibility logic
$ba = Get-Content -LiteralPath "components/bookings/BookingActions.tsx" -Raw
foreach ($n in @(
    'v3.74.367 — "تنفيذ الخدمة" visibility',
    'const canExecute = (() => {',
    'assignedStaffUserIds?: string[] | null',
    'pending === "execute"'
)) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingActions missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingActions: تنفيذ الخدمة button + visibility" -ForegroundColor Green

# Booking page passes the assignments props
$bp = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
foreach ($n in @(
    'assignedStaffUserIds={(booking as any).assigned_staff_user_ids',
    'staffUserId={(booking as any).staff_user_id'
)) {
    if ($bp -notmatch [regex]::Escape($n)) {
        Write-Host "X booking page missing prop: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ booking page: forwards assignments to BookingActions" -ForegroundColor Green

# BookingsTab no longer renders the execute button
$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
if ($bt -match 'handleActivate\(') {
    Write-Host "X BookingsTab still calls handleActivate" -ForegroundColor Red; exit 1
}
if ($bt -match 'canExecuteRow') {
    Write-Host "X BookingsTab still defines canExecuteRow" -ForegroundColor Red; exit 1
}
if ($bt -notmatch [regex]::Escape('v3.74.367 — "تنفيذ الخدمة" moved')) {
    Write-Host "X BookingsTab missing v3.74.367 marker" -ForegroundColor Red; exit 1
}
Write-Host "+ BookingsTab: execute button removed, view-only" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_367.txt"
    $msgLines = @(
        'refactor(bookings): v3.74.367 - move "تنفيذ الخدمة" to booking detail page',
        '',
        'Owner asked for the execute button to live inside the booking',
        'detail page (BookingActions) instead of the bookings tab in',
        '/sales-orders. The visibility rules stay the same:',
        '',
        '  Visible when ALL of the following hold:',
        '    1. status = draft',
        '    2. confirmed_at is set (the booking is actually an "أمر حجز")',
        '    3. user is owner OR general_manager OR is named in the',
        '       booking assignments OR the booking is open queue (no',
        '       assignments + no legacy staff)',
        '',
        'Changes',
        '  - BookingActions: new canExecute gate + PlayCircle button +',
        '    confirmation dialog. Maps to the same /activate route the',
        '    bookings tab used to call.',
        '  - Booking detail page: forwards assigned_staff_user_ids and',
        '    staff_user_id from the booking payload to BookingActions.',
        '  - BookingsTab in /sales-orders: stripped the execute button,',
        '    canExecuteRow, handleActivate, and the unused imports.',
        '    The eye button still navigates to the booking detail page',
        '    where the named staff (or owner) can run the execution.',
        '',
        'Files',
        '  components/bookings/BookingActions.tsx',
        '  app/bookings/[id]/page.tsx',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.367'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.367 pushed" -ForegroundColor Green
}
