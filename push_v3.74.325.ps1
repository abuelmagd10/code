$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.324.ps1") { Remove-Item -LiteralPath "push_v3.74.324.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.325"') {
    Write-Host "+ 3.74.325" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# BookingsTab component
$tab = "components/sales-orders/BookingsTab.tsx"
if (-not (Test-Path -LiteralPath $tab)) {
    Write-Host "X BookingsTab missing" -ForegroundColor Red; exit 1
}
$tabBody = Get-Content -LiteralPath $tab -Raw
foreach ($n in @(
    'v3.74.325 — "أوامر الحجز" tab',
    '/api/bookings?',
    'غير محدد (مفتوح للفرع)'
)) {
    if ($tabBody -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: list view ready" -ForegroundColor Green

# sales-orders page integration
$so = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
foreach ($n in @(
    'import { BookingsTab }',
    'activeTab, setActiveTab',
    'value="bookings"',
    '<BookingsTab lang={appLang} />',
    'v3.74.325 — close the wrapping div'
)) {
    if ($so -notmatch [regex]::Escape($n)) {
        Write-Host "X sales-orders page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ sales-orders page: tab bar + wrapping div" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_325.txt"
    $msgLines = @(
        'feat(sales-orders): v3.74.325 - "أوامر الحجز" tab inside /sales-orders',
        '',
        'Second of three migrations rolling out the unified booking-orders',
        'flow. v3.74.324 already widened the RLS on bookings so staff /',
        'booking_officer can see the open queue. This one adds the UI.',
        '',
        'NEW: components/sales-orders/BookingsTab.tsx',
        '  A thin, read-only-ish list view over /api/bookings. Columns:',
        '  booking_no, customer, service, date/time, staff, amount,',
        '  status, action. Unassigned bookings are flagged in amber as',
        '  "غير محدد (مفتوح للفرع)". Search box + status filter +',
        '  refresh button + "حجز جديد" CTA. The eye-icon button opens',
        '  /bookings/[id] for now — v3.74.326 will add the activate',
        '  flow on the booking detail page.',
        '',
        'CHANGED: app/sales-orders/page.tsx',
        '  Added a two-tab strip immediately below ERPPageHeader:',
        '    1. أوامر البيع  — the existing content, now wrapped in',
        '       a div that hides when the bookings tab is active',
        '    2. أوامر الحجز  — renders <BookingsTab />',
        '  Used a single useState for the active tab. No data was moved',
        '  to sales_orders. The booking lifecycle, availability check,',
        '  schedules and staff tables stay completely untouched.',
        '',
        'Visibility per role on the bookings tab (enforced by RLS):',
        '  owner / admin / general_manager  -> all company bookings',
        '  manager                          -> branch bookings',
        '  booking_officer / staff          -> created-by-me +',
        '                                       assigned-to-me +',
        '                                       unassigned-in-my-branch',
        '',
        'Files',
        '  components/sales-orders/BookingsTab.tsx (NEW)',
        '  app/sales-orders/page.tsx',
        '  lib/version.ts -> 3.74.325'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.325 pushed" -ForegroundColor Green
}
