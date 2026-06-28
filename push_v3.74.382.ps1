$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.381.ps1") { Remove-Item -LiteralPath "push_v3.74.381.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.382"') {
    Write-Host "+ 3.74.382" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260628000382_v3_74_382_renew_seat_licenses.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 382" -ForegroundColor Green
} else { Write-Host "X missing migration 382" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'renew_seat_licenses',
    'get_expired_seat_license_ids',
    'last_renewal_invoice_id',
    'seat_licenses_renewed',
    "INTERVAL '1 month'",
    "INTERVAL '1 year'"
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers renewal RPC + expired-ids helper" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/billing/seat-service.ts" -Raw
foreach ($n in @('renewSeatLicenses', 'getExpiredSeatLicenseIds')) {
    if ($svc -notmatch [regex]::Escape($n)) {
        Write-Host "X seat-service missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ seat-service exports renewal helpers" -ForegroundColor Green

$sub = Get-Content -LiteralPath "lib/billing/subscription-service.ts" -Raw
foreach ($n in @('handleRenewalSuccess', 'renewSeatLicenses', "action === 'renew'")) {
    if ($sub -notmatch [regex]::Escape($n)) {
        Write-Host "X subscription-service missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ subscription-service routes renewal webhooks" -ForegroundColor Green

$webhook = Get-Content -LiteralPath "app/api/webhooks/paymob/route.ts" -Raw
foreach ($n in @('seat_license_ids', "action === 'renew'")) {
    if ($webhook -notmatch [regex]::Escape($n)) {
        Write-Host "X paymob webhook missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ paymob webhook passes renewal extras" -ForegroundColor Green

$renewRoute = "app/api/billing/seats/renew/route.ts"
if (-not (Test-Path -LiteralPath $renewRoute)) {
    Write-Host "X missing renew route" -ForegroundColor Red; exit 1
}
$renewContent = Get-Content -LiteralPath $renewRoute -Raw
foreach ($n in @('renewSeatLicenses', "action: `"renew`"", 'all_expired')) {
    if ($renewContent -notmatch [regex]::Escape($n)) {
        Write-Host "X renew route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ renew route handles all three modes" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/settings/seats/page.tsx" -Raw
foreach ($n in @('startRenewal', "تجديد كل المقاعد المنتهية", 'onRenew', 'isRenewing')) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X seats page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ seats page wires renewal UI" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_382.txt"
    $msgLines = @(
        'feat(seats): v3.74.382 - per-seat renewal flow (Stage 5 of 6)',
        '',
        'Owner can now renew any subset of seats with their own',
        'Paymob checkout. Three modes per the spec:',
        '  - one seat',
        '  - several selected seats',
        '  - all expired seats',
        '',
        'Pricing follows the existing engine: volume discount applies',
        'to the count being renewed in this single payment, not the',
        'total company seat count. Each seats own expires_at moves',
        'forward by 1 month (or 1 year for annual). Expired seats',
        'restart from NOW; still-active seats extend from existing',
        'expires_at so the customer keeps days they already paid for.',
        '',
        'DB',
        '  function renew_seat_licenses(company, ids, period,',
        '                               invoice_id, performed_by)',
        '    - advisory lock per company',
        '    - dedup on (license_id, last_renewal_invoice_id) so a',
        '      re-fired webhook is a no-op',
        '    - only operates on licenses that belong to the caller',
        '      company (silently drops foreign ids)',
        '    - stamps last_renewed_at + last_renewal_invoice_id on',
        '      each renewed row',
        '    - audit log entry action=seat_licenses_renewed with',
        '      ids + count + period + invoice + performed_by',
        '  function get_expired_seat_license_ids(company)',
        '    - used by the renew-all mode',
        '',
        'API',
        '  POST /api/billing/seats/renew',
        '    - owner-only',
        '    - body: { mode, seat_license_ids?, billing_period?, coupon? }',
        '    - mode=all_expired resolves the list server-side',
        '    - validates every id belongs to the active company',
        '    - same calculatePricing engine as buy',
        '    - free-grant coupon path renews directly without Paymob',
        '    - otherwise builds Paymob intention with extras.action=',
        '      "renew" and extras.seat_license_ids',
        '',
        'Webhook',
        '  /api/webhooks/paymob now extracts action + seat_license_ids',
        '    + renew_count and passes them through to syncSubscription',
        '    FromWebhook. The dispatcher routes successful renewal',
        '    transactions to handleRenewalSuccess which:',
        '      - creates the renewal billing_invoice (description',
        '        carries invoice_kind="renewal")',
        '      - calls renewSeatLicenses with the invoice id',
        '      - writes a renewal_success audit log',
        '    Failed/pending webhooks fall through to the existing',
        '    handlers.',
        '',
        'UI (/settings/seats)',
        '  - "تجديد كل المقاعد المنتهية (N)" prominent button inside',
        '    the orange expired-seats alert (only the owner sees it)',
        '  - per-row "جدد المقعد" button next to the expiry date',
        '    column. Color shifts orange for expired seats and violet',
        '    for active ones (extend before expiry)',
        '  - spinners on the affected rows during checkout redirect',
        '  - inline destructive banner for renewal errors',
        '',
        'Next stage',
        '  v3.74.383 - invitation flow review + suspended page polish',
        '',
        'Files',
        '  supabase/migrations/20260628000382_v3_74_382_renew_seat_licenses.sql',
        '  lib/billing/seat-service.ts',
        '  lib/billing/subscription-service.ts',
        '  app/api/webhooks/paymob/route.ts',
        '  app/api/billing/seats/renew/route.ts',
        '  app/settings/seats/page.tsx',
        '  lib/version.ts -> 3.74.382',
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
    Write-Host "`n+ v3.74.382 pushed - per-seat renewal live" -ForegroundColor Green
}
