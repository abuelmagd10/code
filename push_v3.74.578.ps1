$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.577.ps1") { Remove-Item -LiteralPath "push_v3.74.577.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.578"') {
    Write-Host "+ 3.74.578" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$addons = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
if ($addons -notmatch "draftWindow" -or $addons -notmatch "invoiceId" -or $addons -notmatch "invoiceStatus") {
    Write-Host "X BookingAddons draft-window logic missing" -ForegroundColor Red; exit 1
}
$page = Get-Content -LiteralPath "app/bookings/[id]/page.tsx" -Raw
if ($page -notmatch "invoiceId=\{booking\.invoice_id") {
    Write-Host "X booking page not passing invoiceId" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260707000578_v3_74_578_booking_sale_products_cycle.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ booking sale-products cycle (UI window + migration mirror)" -ForegroundColor Green

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
    "supabase/migrations/20260707000578_v3_74_578_booking_sale_products_cycle.sql" `
    "lib/version.ts" `
    "push_v3.74.578.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.577.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_578.txt"
    $msgLines = @(
        'feat(bookings): v3.74.578 - two-path completion + draft edit window',
        '',
        'Owner decision: split executed bookings into two cycles.',
        '',
        'Case 1 - booking carries walk-in SALE products (extras):',
        '- execution deducts ONLY consumed service materials (bundle);',
        '  sale products are NOT deducted at execution anymore - they are',
        '  dispatched later through the sales warehouse cycle.',
        '- invoice stays DRAFT (no accounting at execution). Accountant',
        '  posts it via the standard sales flow, then the store manager',
        '  confirms goods-out (stock deducted there).',
        '- edit window: while the invoice is draft, the ASSIGNED staff',
        '  (and owner/admin/GM) may amend the addons; the invoice lines,',
        '  totals, consumption rows and warehouse_status resync',
        '  atomically (resync_booking_invoice), the branch accountant is',
        '  re-notified (high) and owner/GM/branch manager get FYI',
        '  notifications. booking_officer rights end at execution.',
        '- once the invoice leaves draft: locked for everyone; changes go',
        '  through the sales-return cycle.',
        '',
        'Case 2 - service-only booking: unchanged (immediate accounting,',
        'sent/paid at execution; accountant only handles payment).',
        '',
        'Also fixes a regression found during review:',
        'trg_auto_approve_service_only_invoice ran AFTER INSERT on',
        'invoices - before any items existed - so EVERY invoice was',
        'warehouse-auto-approved, silently skipping the store manager.',
        'New invoice_items-level trigger keeps warehouse_status truthful',
        'while the invoice is still draft (goods lines -> pending,',
        'service-only -> approved).',
        '',
        'DB migration 20260707000578 already live via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.578 pushed - booking sale-products cycle live" -ForegroundColor Green
}
