$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.602.ps1") { Remove-Item -LiteralPath "push_v3.74.602.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.603"') {
    Write-Host "+ 3.74.603" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch "get_invoice_source") {
    Write-Host "X invoice page not using get_invoice_source" -ForegroundColor Red; exit 1
}
$ed = Get-Content -LiteralPath "app/invoices/[id]/edit/page.tsx" -Raw
if ($ed -notmatch "get_invoice_source") {
    Write-Host "X invoice edit page not using get_invoice_source" -ForegroundColor Red; exit 1
}
$rt = Get-Content -LiteralPath "app/api/invoices/[id]/update/route.ts" -Raw
if ($rt -notmatch "sales_order_id" -or $rt -notmatch "general_manager") {
    Write-Host "X update route SO-role guard missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260710000603_v3_74_603_invoice_source_lookup.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice edit governance markers present" -ForegroundColor Green

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
    "app/invoices/[id]/page.tsx" `
    "app/invoices/[id]/edit/page.tsx" `
    "app/api/invoices/[id]/update/route.ts" `
    "supabase/migrations/20260710000603_v3_74_603_invoice_source_lookup.sql" `
    "lib/version.ts" `
    "push_v3.74.603.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.602.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_603.txt"
    $msgLines = @(
        'feat(invoices): v3.74.603 - order-owned editing for the sales cycle too',
        '',
        'Owner generalized the booking rule to sales: the accountant',
        'never edits invoices - the ORDER creator edits the ORDER and the',
        'linked invoice follows. Verified the sync already exists',
        '(sales-order edit rebuilds invoice_items; the',
        'sync_sales_order_to_invoice trigger syncs totals/status), so',
        'this release is pure governance:',
        '',
        '- NEW RLS-proof RPC get_invoice_source(invoice) (DB, live via',
        '  MCP): returns booking/sales-order linkage for any company',
        '  member. Fixes the Edit-button leak the owner caught: the UI',
        '  checked linkage by SELECTing bookings directly, which the',
        '  accountant RLS hid -> gate bypassed client-side (the server',
        '  guard, on the service-role client, was verified safe).',
        '- invoice detail + edit pages use the RPC; booking-linked stays',
        '  blocked for everyone; sales-order-linked now blocked for all',
        '  but owner/admin/general_manager (their direct-creation path),',
        '  with a blue "Sales-order invoice" badge + blocking notice',
        '  linking to the order.',
        '- /api/invoices/[id]/update: server-side 403 for non-management',
        '  on SO-linked invoices (service-role lookup, before any work).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.603 pushed - orders own their invoices" -ForegroundColor Green
}
