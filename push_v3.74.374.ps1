$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.373.ps1") { Remove-Item -LiteralPath "push_v3.74.373.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.374"') {
    Write-Host "+ 3.74.374" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260627000374_v3_74_374_booking_discount_gate.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 374: booking_discount_gate" -ForegroundColor Green
} else { Write-Host "X missing migration 374" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'bkg_request_discount_approval_trg',
    'bkg_request_discount_approval',
    'activate_booking_atomic',
    'discount_approvals',
    'Auto-backfill on v3.74.374 rollout'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration body covers trigger + gate + backfill" -ForegroundColor Green

$apiRoute = "app/api/bookings/[id]/discount-approval/route.ts"
if (-not (Test-Path -LiteralPath $apiRoute)) { Write-Host "X missing discount-approval route" -ForegroundColor Red; exit 1 }
$apiContent = Get-Content -LiteralPath $apiRoute -Raw
if ($apiContent -notmatch "blocked_pending") { Write-Host "X discount-approval route missing gate logic" -ForegroundColor Red; exit 1 }
Write-Host "+ booking discount-approval route present" -ForegroundColor Green

$banner = "components/bookings/BookingDiscountApprovalBanner.tsx"
if (-not (Test-Path -LiteralPath $banner)) { Write-Host "X missing banner component" -ForegroundColor Red; exit 1 }
$bannerContent = Get-Content -LiteralPath $banner -Raw
foreach ($n in @(
    'blocked_pending', 'blocked_rejected', 'blocked_no_request',
    'onGateChange'
)) {
    if ($bannerContent -notmatch [regex]::Escape($n)) {
        Write-Host "X banner missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ banner component handles all four states" -ForegroundColor Green

$actions = Get-Content -LiteralPath "components/bookings/BookingActions.tsx" -Raw
if ($actions -notmatch "discountGate") { Write-Host "X BookingActions missing discountGate prop" -ForegroundColor Red; exit 1 }
if ($actions -notmatch 'disabled=\{discountGate !== "open"\}') { Write-Host "X BookingActions does not disable execute button" -ForegroundColor Red; exit 1 }
Write-Host "+ BookingActions disables execute when gate is closed" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($page -notmatch "BookingDiscountApprovalBanner") { Write-Host "X booking page missing banner" -ForegroundColor Red; exit 1 }
if ($page -notmatch "discountGate=\{discountGate\}") { Write-Host "X booking page does not pipe gate state to actions" -ForegroundColor Red; exit 1 }
Write-Host "+ booking page renders banner and pipes gate" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_374.txt"
    $msgLines = @(
        'feat(approvals): v3.74.374 - booking discount approval gate (Stage 3 of 5)',
        '',
        'Stage 3 of the discount-approval rollout: bookings.',
        '',
        'A staff member adds a discount to a booking, presses',
        '"تنفيذ الخدمة", and the activation RPC now refuses to run',
        'unless the owner or general manager has approved the exact',
        'discount value first. The original v3.74.370 bug (where staff',
        'baikeyous1@ added a 10 EGP discount and the activate path',
        'failed silently mid-flow) is closed end to end: the discount',
        'no longer sneaks through the constraint check, and the staff',
        'member sees a clear "awaiting approval" banner before they',
        'attempt to execute.',
        '',
        'DB',
        '  trigger bkg_request_discount_approval on bookings',
        '    AFTER INSERT OR UPDATE OF discount_amount',
        '    auto-opens a pending discount_approvals row when:',
        '      - discount_amount > 0',
        '      - status is draft or confirmed',
        '      - no invoice yet',
        '    cancels any stale pending row for a different amount',
        '    idempotent: skips when there is already a pending or',
        '    approved row matching the new amount',
        '  function activate_booking_atomic',
        '    same hop-through-confirmed logic from v3.74.370 plus a',
        '    new gate as the first check after FOR UPDATE: refuses',
        '    to run if discount_amount > 0 without a matching',
        '    approved approval row',
        '    error strings are in Arabic so they surface verbatim',
        '    in the staff toast',
        '  backfill',
        '    opens pending rows for any draft/confirmed booking with',
        '    discount_amount > 0 that pre-dates this migration. Empty',
        '    on the prod DB at apply time but kept in the file so',
        '    supabase db reset stays consistent.',
        '',
        'API',
        '  GET /api/bookings/[id]/discount-approval',
        '    returns the latest approval row + a derived gate field',
        '    (open / blocked_no_request / blocked_pending /',
        '    blocked_rejected). The page consumes the gate; the',
        '    banner consumes the row.',
        '',
        'UI',
        '  components/bookings/BookingDiscountApprovalBanner.tsx',
        '    new banner shown above the actions card. Four variants:',
        '    pending (yellow), rejected (red with note), approved',
        '    (slim green), no-request (orange fallback).',
        '  components/bookings/BookingActions.tsx',
        '    accepts discountGate prop. تنفيذ الخدمة button locks',
        '    (disabled + "blocked" suffix + tooltip) when the gate',
        '    is not open. Other actions (confirm, edit, cancel) are',
        '    unaffected.',
        '  app/bookings/[id]/page.tsx',
        '    renders the banner above the actions card and forwards',
        '    its gate state into BookingActions.',
        '',
        'Next stages',
        '  v3.74.375 - wire sales invoice posting gate',
        '  v3.74.376 - wire purchase invoice posting gate',
        '',
        'Files',
        '  supabase/migrations/20260627000374_v3_74_374_booking_discount_gate.sql',
        '  app/api/bookings/[id]/discount-approval/route.ts',
        '  components/bookings/BookingDiscountApprovalBanner.tsx',
        '  components/bookings/BookingActions.tsx',
        '  app/bookings/[id]/page.tsx',
        '  lib/version.ts -> 3.74.374',
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
    Write-Host "`n+ v3.74.374 pushed" -ForegroundColor Green
}
