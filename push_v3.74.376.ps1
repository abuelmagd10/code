$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.375.ps1") { Remove-Item -LiteralPath "push_v3.74.375.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.376"') {
    Write-Host "+ 3.74.376" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260627000376_v3_74_376_purchase_invoice_discount_gate.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 376" -ForegroundColor Green
} else { Write-Host "X missing migration 376" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'bill_request_discount_approval_trg',
    'bill_block_post_unapproved_discount_trg',
    'bill_request_discount_approval',
    'bill_block_post_unapproved_discount',
    'purchase_invoice',
    'Auto-backfill on v3.74.376 rollout'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers triggers + backfill" -ForegroundColor Green

$api = "app/api/bills/[id]/discount-approval/route.ts"
if (-not (Test-Path -LiteralPath $api)) { Write-Host "X missing API route" -ForegroundColor Red; exit 1 }
$apiContent = Get-Content -LiteralPath $api -Raw
if ($apiContent -notmatch "purchase_invoice") { Write-Host "X API route missing document_type filter" -ForegroundColor Red; exit 1 }
if ($apiContent -notmatch "blocked_pending") { Write-Host "X API route missing gate logic" -ForegroundColor Red; exit 1 }
Write-Host "+ bill discount-approval API route present" -ForegroundColor Green

$banner = "components/bills/BillDiscountApprovalBanner.tsx"
if (-not (Test-Path -LiteralPath $banner)) { Write-Host "X missing banner component" -ForegroundColor Red; exit 1 }
$bannerContent = Get-Content -LiteralPath $banner -Raw
foreach ($n in @('blocked_pending','blocked_rejected','blocked_no_request','onGateChange')) {
    if ($bannerContent -notmatch [regex]::Escape($n)) {
        Write-Host "X banner missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ banner handles all four states" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($page -notmatch "BillDiscountApprovalBanner") { Write-Host "X bills page missing banner import" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'setDiscountGate') { Write-Host "X bills page missing gate state" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'discountGate !== "open"') { Write-Host "X bills page missing pre-send guard" -ForegroundColor Red; exit 1 }
Write-Host "+ bills page wired with banner + pre-send guard" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_376.txt"
    $msgLines = @(
        'feat(approvals): v3.74.376 - purchase invoice discount gate (Stage 5 of 5)',
        '',
        'Final stage of the discount-approval rollout: purchase',
        'invoices (bills). With this in place, all four surfaces the',
        'owner originally identified - bookings, sales invoices,',
        'purchase invoices, and the auto-generated booking invoice -',
        'route every non-zero discount through the owner / general',
        'manager.',
        '',
        'DB',
        '  trigger bill_request_discount_approval on bills',
        '    AFTER INSERT OR UPDATE OF discount_value, discount_type',
        '    auto-opens a pending discount_approvals row when:',
        '      - discount_value > 0',
        '      - status = draft',
        '      - app.skip_discount_approval is not set to ''booking''',
        '    idempotent: skips when there is already a pending or',
        '    approved row matching the new value AND type',
        '    cancels stale pending rows on value/type changes',
        '  trigger bill_block_post_unapproved_discount on bills',
        '    BEFORE UPDATE OF status',
        '    refuses to flip from draft to sent / approved / posted /',
        '    paid / partially_paid when discount_value > 0 without a',
        '    matching approved approval row. Rejection / deletion',
        '    paths stay open since they do not post anything.',
        '  requester precedence',
        '    last_edited_by_user_id (whoever just saved) > ',
        '    created_by_user_id > created_by',
        '  backfill',
        '    opens pending rows for any draft bill with',
        '    discount_value > 0 that pre-dates this migration.',
        '',
        'API',
        '  GET /api/bills/[id]/discount-approval',
        '    same shape as the invoice endpoint, document_type =',
        '    purchase_invoice. Returns the resolved gate the page',
        '    consumes.',
        '',
        'UI',
        '  components/bills/BillDiscountApprovalBanner.tsx',
        '    same four-variant card the invoice + booking banners',
        '    use, scoped to bills.',
        '  app/bills/[id]/page.tsx',
        '    + new state discountGate',
        '    + banner rendered at the top of the content',
        '    + changeStatus("sent") short-circuits with a destructive',
        '      toast when the gate is not open. DB trigger still',
        '      enforces strictly if the UI check is bypassed.',
        '',
        'Rollout complete',
        '  v3.74.372 - foundation (table + RPCs)',
        '  v3.74.373 - inbox UI + badges',
        '  v3.74.374 - booking gate',
        '  v3.74.375 - sales invoice gate',
        '  v3.74.376 - purchase invoice gate <- this',
        '',
        'Files',
        '  supabase/migrations/20260627000376_v3_74_376_purchase_invoice_discount_gate.sql',
        '  app/api/bills/[id]/discount-approval/route.ts',
        '  components/bills/BillDiscountApprovalBanner.tsx',
        '  app/bills/[id]/page.tsx',
        '  lib/version.ts -> 3.74.376',
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
    Write-Host "`n+ v3.74.376 pushed - discount approval rollout COMPLETE" -ForegroundColor Green
}
