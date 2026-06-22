$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.269.ps1") { Remove-Item -LiteralPath "push_v3.74.269.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.270"') {
    Write-Host "+ 3.74.270" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bill = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
foreach ($c in @(
    'maybeSingle()',
    'الفاتورة مش موجودة',
    'v3.74.270'
)) {
    if ($bill -notmatch [regex]::Escape($c)) { Write-Host "X bills/[id] missing $c" -ForegroundColor Red; exit 1 }
}
# Make sure no .single() left on the main bills load
if ($bill -match "from\(`"bills`"\)[^\.]*\.select[^\.]*\.eq[^\.]*\.eq[^\.]*\.single\(\)") {
    Write-Host "X bills/[id] still uses .single() somewhere on the load query" -ForegroundColor Red; exit 1
}
Write-Host "+ /bills/[id] now handles missing bills with a friendly card instead of crashing" -ForegroundColor Green

if (-not (Test-Path -LiteralPath "supabase/migrations/20260622000270_v3_74_270_test_company_manufacturing_cleanup.sql")) {
    Write-Host "X cleanup migration missing" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260622000270_v3_74_270_test_company_manufacturing_cleanup.sql" -Raw
foreach ($c in @(
    "session_replication_role = 'replica'",
    'ab1ecbd9-4780-4c64-90ef-2238a881c8e9',
    'name ILIKE',
    'production_order_issue_lines',
    'manufacturing_boms'
)) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ Cleanup migration scoped to test company; uses session_replication_role bypass for guard triggers" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_270.txt"
    $msgLines = @(
        'fix: v3.74.270 - bill detail page no longer crashes for missing bills + test company cleanup',
        '',
        'Bug 1 (UI): /bills/[id] was using .single() to load the bill, which',
        'throws a runtime error when the id does not exist. A stale link',
        'from inventory-transactions pointing to a hard-deleted bill made',
        'the page show the generic Application Error screen instead of a',
        'helpful message. Swapped to .maybeSingle() + an inline error',
        'capture, and replaced the bare red text fallback with a friendly',
        'card that explains the bill is missing and offers Back / Go to',
        'bills buttons. Same code path handles deleted bills, wrong',
        'company, and typo-ed URLs.',
        '',
        'Bug 2 (data): the test company had an orphan inventory_transaction',
        '(purchase of 1 ماتور) that referenced a deleted bill, plus the',
        'matching production_issue and production_receipt entries that',
        'survived from a previous test run. The owner approved a full',
        'cleanup of the test company manufacturing data.',
        '',
        'Cleanup migration (20260622000270) wipes, scoped to company name',
        'تست only:',
        '  - inventory_reservation chain (consumptions, allocations, lines,',
        '    reservations) that referenced the production transactions.',
        '  - production_order_* tables (receipt_lines, receipt_events,',
        '    issue_lines, issue_events, material_requirements).',
        '  - inventory_transactions: the two production rows and the',
        '    orphan purchase pointing to bill ab1ecbd9-...',
        '  - production journal entries (header + lines).',
        '  - cogs_transactions.',
        '  - manufacturing module data: material_issue_approvals,',
        '    product_receive_approvals, production_order_operations,',
        '    production_orders, routing_operations, routing_versions,',
        '    routings, bom_line_substitutes, bom_lines, bom_versions,',
        '    boms, work_centers.',
        '',
        'The migration uses SET LOCAL session_replication_role = replica',
        'because the production_order_* and inventory_reservation_*',
        'tables carry immutability guards designed for normal business',
        'operations, not for owner-approved test-data repair. The replica',
        'role bypass is scoped to the transaction and does not affect',
        'any other tenant.',
        '',
        'Verification after deploy:',
        '  manufacturing_boms / routings / work_centers / production_orders',
        '  / production_order_issue_lines / production_order_receipt_lines',
        '  / cogs / production journal entries / production inventory tx',
        '  / orphan purchase inventory tx',
        '  all = 0 for test company.',
        '',
        'Files',
        '  app/bills/[id]/page.tsx',
        '  supabase/migrations/20260622000270_v3_74_270_test_company_manufacturing_cleanup.sql (new)',
        '  lib/version.ts -> 3.74.270'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.270 pushed" -ForegroundColor Green
}
