$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.579.ps1") { Remove-Item -LiteralPath "push_v3.74.579.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.580"') {
    Write-Host "+ 3.74.580" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$prod = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($prod -notmatch 'shelf_life_days') {
    Write-Host "X products form: shelf_life_days field missing" -ForegroundColor Red; exit 1
}
$api = Get-Content -LiteralPath "app/api/product-expiry/route.ts" -Raw
if ($api -notmatch 'fifo_cost_lots' -or $api -notmatch 'writeoff_history') {
    Write-Host "X product-expiry API: live lots upgrade missing" -ForegroundColor Red; exit 1
}
$rep = Get-Content -LiteralPath "app/reports/product-expiry/page.tsx" -Raw
if ($rep -notmatch 'update_lot_expiry') {
    Write-Host "X expiry report: inline lot-expiry edit missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260708000580_v3_74_580_product_expiry_phase1.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ expiry phase-1 markers present (form + API + report + migration)" -ForegroundColor Green

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
    "app/products/page.tsx" `
    "app/api/products/route.ts" `
    "app/api/products/[id]/route.ts" `
    "app/api/product-expiry/route.ts" `
    "app/reports/product-expiry/page.tsx" `
    "supabase/migrations/20260708000580_v3_74_580_product_expiry_phase1.sql" `
    "lib/version.ts" `
    "push_v3.74.580.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.579.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_580.txt"
    $msgLines = @(
        'feat(inventory): v3.74.580 - product expiry tracking phase 1',
        '',
        'Real-customer request: expiry dates + expiry alerts.',
        '',
        'Design: expiry belongs to the BATCH, not the product - the',
        'existing FIFO cost lots are the batch registry, so expiry_date',
        'lives there. products.shelf_life_days (optional) auto-stamps',
        'expiry on every new lot (purchase receipt, opening stock,',
        'manufacturing output, return reversal) via a BEFORE INSERT',
        'trigger. Zero impact on costing/posting/sales flows: the column',
        'is read-only metadata to every existing cycle.',
        '',
        'DB (migration 20260708000580, already live via MCP):',
        '- fifo_cost_lots.expiry_date + partial index',
        '- products.shelf_life_days (positive integer, nullable)',
        '- auto_stamp_lot_expiry trigger',
        '- update_lot_expiry() RPC (owner/admin/GM anywhere;',
        '  store/warehouse managers branch-scoped; auth.uid()-enforced)',
        '- check_product_expiry_notifications() + daily pg_cron 05:00 UTC:',
        '  idempotent notifications (event_key per lot per stage) to',
        '  store_manager/warehouse_manager/manager (branch) + owner for',
        '  lots expiring within 30 days (warning) or expired (high/error)',
        '',
        'UI:',
        '- products form: optional "shelf life (days)" field (products',
        '  only, not services), persisted through create + update APIs',
        '- /reports/product-expiry rebuilt: live batch table (branch,',
        '  warehouse, lot date, expiry, remaining qty, days left, status)',
        '  + summary cards + at-risk cost + status filter + inline expiry',
        '  edit via the RPC + write-off history as collapsed secondary',
        '- /api/product-expiry: reads live fifo_cost_lots (was write-off',
        '  history only) with batched name resolution'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.580 pushed - product expiry phase 1 live" -ForegroundColor Green
}
