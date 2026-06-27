$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.374.ps1") { Remove-Item -LiteralPath "push_v3.74.374.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.375"') {
    Write-Host "+ 3.74.375" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260627000375_v3_74_375_sales_invoice_discount_gate.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 375" -ForegroundColor Green
} else { Write-Host "X missing migration 375" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'inv_request_discount_approval_trg',
    'inv_block_post_unapproved_discount_trg',
    'inv_request_discount_approval',
    'inv_block_post_unapproved_discount',
    'app.skip_discount_approval',
    'set_config(''app.skip_discount_approval''',
    'Auto-backfill on v3.74.375 rollout'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers triggers + bypass + backfill" -ForegroundColor Green

$api = "app/api/invoices/[id]/discount-approval/route.ts"
if (-not (Test-Path -LiteralPath $api)) { Write-Host "X missing API route" -ForegroundColor Red; exit 1 }
$apiContent = Get-Content -LiteralPath $api -Raw
if ($apiContent -notmatch "blocked_pending") { Write-Host "X API route missing gate logic" -ForegroundColor Red; exit 1 }
Write-Host "+ invoice discount-approval API route present" -ForegroundColor Green

$banner = "components/invoices/InvoiceDiscountApprovalBanner.tsx"
if (-not (Test-Path -LiteralPath $banner)) { Write-Host "X missing banner component" -ForegroundColor Red; exit 1 }
$bannerContent = Get-Content -LiteralPath $banner -Raw
foreach ($n in @('blocked_pending','blocked_rejected','blocked_no_request','onGateChange')) {
    if ($bannerContent -notmatch [regex]::Escape($n)) {
        Write-Host "X banner missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ banner handles all four states" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "InvoiceDiscountApprovalBanner") { Write-Host "X invoice page missing banner import" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'setDiscountGate') { Write-Host "X invoice page missing gate state" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'discountGate !== "open"') { Write-Host "X invoice page missing pre-send guard" -ForegroundColor Red; exit 1 }
Write-Host "+ invoice page wired with banner + pre-send guard" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_375.txt"
    $msgLines = @(
        'feat(approvals): v3.74.375 - sales invoice discount gate (Stage 4 of 5)',
        '',
        'Stage 4 of the discount-approval rollout: sales invoices.',
        '',
        'Same pattern as the booking gate (v3.74.374) but on invoices.',
        'Three pieces in the DB and a banner + pre-send guard on the',
        'invoice page.',
        '',
        'DB',
        '  trigger inv_request_discount_approval on invoices',
        '    AFTER INSERT OR UPDATE OF discount_value, discount_type',
        '    auto-opens a pending discount_approvals row when:',
        '      - discount_value > 0',
        '      - status = draft',
        '      - app.skip_discount_approval is not set to ''booking''',
        '    idempotent: skips when there is already a pending or',
        '    approved row matching the new value AND type',
        '    cancels stale pending rows for a different value/type',
        '  trigger inv_block_post_unapproved_discount on invoices',
        '    BEFORE UPDATE OF status',
        '    refuses to flip from draft to sent/posted/paid/',
        '    partially_paid when discount_value > 0 without a',
        '    matching approved approval. Bypasses on the booking',
        '    flag.',
        '  function complete_booking_atomic',
        '    re-issued with a SET LOCAL app.skip_discount_approval',
        '    = ''booking'' at the top. The booking gate (v3.74.374)',
        '    has already approved the discount, so the auto-',
        '    generated invoice must not be double-gated. SET LOCAL',
        '    is transaction-scoped so the bypass cannot leak.',
        '    Body otherwise byte-identical to v3.74.371.',
        '  backfill',
        '    opens pending rows for any draft sales invoice with',
        '    discount_value > 0 that pre-dates this migration.',
        '',
        'API',
        '  GET /api/invoices/[id]/discount-approval',
        '    returns the latest approval row plus a derived gate',
        '    (open / blocked_no_request / blocked_pending /',
        '    blocked_rejected). Hidden on posted invoices.',
        '',
        'UI',
        '  components/invoices/InvoiceDiscountApprovalBanner.tsx',
        '    same four-variant card as the booking banner. Shown',
        '    above the page header on /invoices/[id].',
        '  app/invoices/[id]/page.tsx',
        '    + new state discountGate; banner sets it on load',
        '    + banner rendered at the top of main content',
        '    + handleChangeStatus("sent") short-circuits with a',
        '      destructive toast when the gate is not open. The DB',
        '      trigger still enforces this strictly even if the UI',
        '      check is bypassed.',
        '',
        'Next stage',
        '  v3.74.376 - wire purchase invoice posting gate',
        '',
        'Files',
        '  supabase/migrations/20260627000375_v3_74_375_sales_invoice_discount_gate.sql',
        '  app/api/invoices/[id]/discount-approval/route.ts',
        '  components/invoices/InvoiceDiscountApprovalBanner.tsx',
        '  app/invoices/[id]/page.tsx',
        '  lib/version.ts -> 3.74.375',
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
    Write-Host "`n+ v3.74.375 pushed" -ForegroundColor Green
}
