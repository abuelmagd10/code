$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.385.ps1") { Remove-Item -LiteralPath "push_v3.74.385.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.387"') {
    Write-Host "+ 3.74.387" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Two migrations land together: 386 (Stage B junction + UI) + 387 (Stage C gate + deduction).
foreach ($m in @(
    "supabase/migrations/20260628000386_v3_74_386_service_products_junction.sql",
    "supabase/migrations/20260628000387_v3_74_387_booking_inventory_gate_and_deduction.sql"
)) {
    if (Test-Path -LiteralPath $m) {
        Write-Host "+ $m" -ForegroundColor Green
    } else {
        Write-Host "X missing $m" -ForegroundColor Red; exit 1
    }
}

$m386 = Get-Content -LiteralPath "supabase/migrations/20260628000386_v3_74_386_service_products_junction.sql" -Raw
foreach ($n in @('service_products', 'service_products_service_product_unique',
                 'get_service_consumables', 'quantity_per_service')) {
    if ($m386 -notmatch [regex]::Escape($n)) {
        Write-Host "X migration 386 missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration 386 covers table + uniqueness + helper" -ForegroundColor Green

$m387 = Get-Content -LiteralPath "supabase/migrations/20260628000387_v3_74_387_booking_inventory_gate_and_deduction.sql" -Raw
foreach ($n in @('check_booking_service_inventory', 'inventory_available_balance',
                 'service_consumption', 'CEIL(con.qty_needed)',
                 'لا يمكن تنفيذ الخدمة', 'consumables_deducted')) {
    if ($m387 -notmatch [regex]::Escape($n)) {
        Write-Host "X migration 387 missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration 387 covers gate + deduction" -ForegroundColor Green

$api = "app/api/services/[id]/products/route.ts"
if (-not (Test-Path -LiteralPath $api)) { Write-Host "X missing API route" -ForegroundColor Red; exit 1 }
$apiContent = Get-Content -LiteralPath $api -Raw
if ($apiContent -notmatch 'service_products') { Write-Host "X API route missing table reference" -ForegroundColor Red; exit 1 }
Write-Host "+ services/[id]/products route present" -ForegroundColor Green

$editor = "components/services/ServiceProductsEditor.tsx"
if (-not (Test-Path -LiteralPath $editor)) { Write-Host "X missing editor component" -ForegroundColor Red; exit 1 }
$editorContent = Get-Content -LiteralPath $editor -Raw
foreach ($n in @('quantity_per_service','المنتجات المستهلكة فى الخدمة','إضافة منتج')) {
    if ($editorContent -notmatch [regex]::Escape($n)) {
        Write-Host "X editor missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ editor component wired with add/remove/save" -ForegroundColor Green

$editPage = Get-Content -LiteralPath "app/services/[id]/edit/page.tsx" -Raw
if ($editPage -notmatch 'ServiceProductsEditor') {
    Write-Host "X edit page missing the editor mount" -ForegroundColor Red; exit 1
}
Write-Host "+ edit page mounts the editor" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_387.txt"
    $msgLines = @(
        'feat(services): v3.74.387 - service consumables (Stages B + C)',
        '',
        'Two stages shipped together:',
        '',
        'STAGE B - service_products junction',
        '  - new table service_products (service_id, product_id,',
        '    quantity_per_service, notes)',
        '  - UNIQUE (service_id, product_id) so same product cant be',
        '    linked twice',
        '  - RLS: company members can SELECT; writes go through API',
        '    routes that enforce role checks',
        '  - helper RPC get_service_consumables(service_id, booking_qty)',
        '    returns the BOM multiplied by booking quantity, with the',
        '    products track_inventory flag so Stage C knows what to gate',
        '  - new API GET/POST /api/services/[id]/products. POST replaces',
        '    the whole BOM atomically; rejects duplicate product picks',
        '    and rows with non-positive quantities; owner/admin/general_',
        '    manager/manager only',
        '  - new UI ServiceProductsEditor mounted on /services/[id]/edit',
        '    below the main service form. Add/remove/save rows. Warns',
        '    when a non-tracked product is picked.',
        '',
        'STAGE C - activation gate + auto-deduction',
        '  - helper RPC check_booking_service_inventory(booking_id)',
        '    returns a jsonb report listing shortages with needed vs',
        '    available, picking the warehouse the same way complete_',
        '    booking_atomic does (branch default, else any).',
        '  - activate_booking_atomic now calls the helper BEFORE the',
        '    draft->confirmed hop. If any tracked consumable is short,',
        '    it raises with an Arabic message listing every shortage',
        '    so the staff sees "كريم (مطلوب 5، متاح 2)" etc.',
        '  - complete_booking_atomic now writes a negative inventory_',
        '    transactions row for each tracked consumable AFTER the',
        '    invoice + JE are in place. transaction_type=service_',
        '    consumption, reference_type=booking_invoice, reference_id',
        '    = invoice id. quantity_change uses CEIL to round up so we',
        '    never under-deduct (column is integer today).',
        '  - non-tracked products silently skipped at both gate and',
        '    deduction. Services with no BOM rows produce no-op (same',
        '    as v3.74.385).',
        '',
        'Backward compatibility',
        '  - Existing bookings: no change (no rows in service_products)',
        '  - Existing services: empty BOM until the owner adds rows',
        '  - Discount approval gate (v3.74.374) preserved',
        '  - Subtotal + JE fixes (v3.74.385) preserved',
        '',
        'Followups',
        '  - inventory_transactions.quantity_change is integer today.',
        '    Stage B accepts fractional quantity_per_service but the',
        '    deduction rounds up. If fractional-stock services are',
        '    needed long-term, the column should become numeric.',
        '  - The /bookings/[id] page could surface the expected',
        '    consumables breakdown so the staff sees what will deduct',
        '    before pressing تنفيذ.',
        '',
        'Files',
        '  supabase/migrations/20260628000386_v3_74_386_service_products_junction.sql',
        '  supabase/migrations/20260628000387_v3_74_387_booking_inventory_gate_and_deduction.sql',
        '  app/api/services/[id]/products/route.ts',
        '  components/services/ServiceProductsEditor.tsx',
        '  app/services/[id]/edit/page.tsx',
        '  lib/version.ts -> 3.74.387',
        '',
        'Note',
        '  Both migrations applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.387 pushed - service consumables + inventory gate live" -ForegroundColor Green
}
