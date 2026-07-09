$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.585.ps1") { Remove-Item -LiteralPath "push_v3.74.585.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.586"') {
    Write-Host "+ 3.74.586" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$prod = Get-Content -LiteralPath "app/products/page.tsx" -Raw
if ($prod -notmatch 'units_per_carton') {
    Write-Host "X products form: units_per_carton missing" -ForegroundColor Red; exit 1
}
$api = Get-Content -LiteralPath "app/api/product-expiry/route.ts" -Raw
if ($api -notmatch 'lot_number' -or $api -notmatch 'units_per_carton') {
    Write-Host "X product-expiry API: lot/carton fields missing" -ForegroundColor Red; exit 1
}
$rep = Get-Content -LiteralPath "app/reports/product-expiry/page.tsx" -Raw
if ($rep -notmatch 'split_fifo_lot') {
    Write-Host "X expiry report: split dialog missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260709000586_v3_74_586_carton_lots_and_split.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ carton/lot-split markers present" -ForegroundColor Green

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
    "supabase/migrations/20260709000586_v3_74_586_carton_lots_and_split.sql" `
    "lib/version.ts" `
    "push_v3.74.586.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.585.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_586.txt"
    $msgLines = @(
        'feat(inventory): v3.74.586 - cartons, lot numbers, receipt lot-splitting',
        '',
        'Owner idea (approved): carton-aware receiving + per-carton',
        'expiry. Phase 2 of expiry tracking - display + advisory only,',
        'dispatch flows untouched (enforced FEFO deferred by decision).',
        '',
        'DB (migration 20260709000586, already live via MCP):',
        '- products.units_per_carton (optional, physical products only)',
        '- fifo_cost_lots.lot_number: short writable code (L2607-0001),',
        '  auto-assigned via per-company counter, existing lots backfilled',
        '- split_fifo_lot(): split an UNCONSUMED lot into >=2 sub-lots,',
        '  each with own expiry; sum must equal lot qty exactly; unit',
        '  cost/branch/warehouse copied so costing totals are unchanged;',
        '  role-gated by auth.uid() (management anywhere, store/warehouse',
        '  managers own branch)',
        '',
        'UI:',
        '- products form: "units per carton" field (mirrors',
        '  shelf_life_days wiring through create/update APIs)',
        '- expiry report: lot number + cartons columns; green FEFO badge',
        '  "expires first - issue from this one" per product/warehouse;',
        '  Split dialog (dynamic rows, split-by-cartons prefill, live sum',
        '  guard, returned lot numbers shown for writing on cartons)'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.586 pushed - carton lot management live" -ForegroundColor Green
}
