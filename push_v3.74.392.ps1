$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.391.ps1") { Remove-Item -LiteralPath "push_v3.74.391.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.392"') {
    Write-Host "+ 3.74.392" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000392_v3_74_392_integrity_baseline.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 392" -ForegroundColor Green
} else { Write-Host "X missing migration 392" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'CREATE OR REPLACE FUNCTION public.assert_baseline()',
    'CREATE OR REPLACE FUNCTION public.baseline_report()',
    'can_modify_data',
    'can_manage_supplier_row',
    'discount_approvals',
    'company_seat_licenses',
    'service_products',
    'bkg_request_discount_approval',
    'inv_block_post_unapproved_discount',
    'bill_block_post_unapproved_discount',
    'sync_employee_user_id_ins',
    'suppliers_insert',
    'run_all_integrity_checks',
    'p_row_branch_id = v_user_branch_id',
    'BASELINE OK: all contracts intact'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers all baseline sections" -ForegroundColor Green

$wrapper = "supabase/integrity_baseline.sql"
if (Test-Path -LiteralPath $wrapper) {
    $wrapperContent = Get-Content -LiteralPath $wrapper -Raw
    foreach ($n in @('SELECT * FROM baseline_report()', 'SELECT assert_baseline()')) {
        if ($wrapperContent -notmatch [regex]::Escape($n)) {
            Write-Host "X wrapper missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ supabase/integrity_baseline.sql wrapper present" -ForegroundColor Green
} else { Write-Host "X missing supabase/integrity_baseline.sql" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "CONTRACTS.md")) {
    Write-Host "X missing CONTRACTS.md" -ForegroundColor Red; exit 1
}
$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
foreach ($n in @(
    'assert_baseline',
    'baseline_report',
    'can_modify_data',
    'can_manage_supplier_row',
    'company_seat_licenses',
    'service_products',
    'run_all_integrity_checks'
)) {
    if ($contracts -notmatch [regex]::Escape($n)) {
        Write-Host "X CONTRACTS.md missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ CONTRACTS.md covers required sections" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_392.txt"
    $msgLines = @(
        'feat(integrity): v3.74.392 - assert_baseline() + baseline_report()',
        '',
        'Owner asked the meta question: how do we avoid the fix-break-fix',
        'loop where one migration silently regresses what an earlier one',
        'guaranteed. Honest answer was: we did not have an automated',
        'check - I rely on memory across ~50 migrations and the owner',
        'catches regressions during manual E2E. This patch makes the',
        'guarantees self-asserting.',
        '',
        'Adds two SECURITY DEFINER functions:',
        '  assert_baseline()  - raises EXCEPTION on the first broken',
        '                       contract. Wraps every prior-version',
        '                       guarantee in one call.',
        '  baseline_report()  - companion that returns one row per',
        '                       contract with status OK / MISSING /',
        '                       BROKEN / ERROR / WARN. Never raises.',
        '',
        'Contracts asserted (sections A-F in CONTRACTS.md):',
        '  A. Critical functions exist (can_modify_data, can_manage_',
        '     supplier_row, complete_booking_atomic, execute_sales_',
        '     invoice_accounting, check_booking_service_inventory,',
        '     run_all_integrity_checks).',
        '  B. Critical tables exist (discount_approvals, company_seat_',
        '     licenses, service_products).',
        '  C. Critical triggers exist (3 discount-approval triggers x',
        '     2 surfaces, plus the 3 employee-user-id sync triggers).',
        '  D. Critical RLS policies exist (suppliers_insert/update/',
        '     delete using the v3.74.391 helper).',
        '  E. Function-body fingerprints: can_modify_data still lists',
        '     all 6 modern operational roles (v3.74.390 contract);',
        '     can_manage_supplier_row still enforces the branch-scoped',
        '     check (v3.74.391 contract).',
        '  F. Per-company data integrity: invokes run_all_integrity_',
        '     checks() on every company; treats severity=error as',
        '     blocking. Warnings surface via baseline_report() for',
        '     visibility without blocking.',
        '',
        'How to use after any migration',
        '  SELECT assert_baseline();         (pass/fail)',
        '  SELECT * FROM baseline_report();  (diagnostics)',
        '',
        'How to extend',
        '  When a new migration introduces a new contract, add one',
        '  assertion block to both functions + one line to',
        '  CONTRACTS.md. Documented in the migration header.',
        '',
        'Initial run against live DB',
        '  baseline_report(): 22 rows, all status=OK.',
        '  assert_baseline(): returns successfully.',
        '',
        'Files',
        '  supabase/migrations/20260629000392_v3_74_392_integrity_baseline.sql',
        '  supabase/integrity_baseline.sql  - thin wrapper for manual psql runs',
        '  CONTRACTS.md                     - readable index of all contracts',
        '  lib/version.ts -> 3.74.392',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.',
        '  baseline_report + assert_baseline both verified green.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.392 pushed - integrity baseline live" -ForegroundColor Green
    Write-Host "  After any future migration, run:" -ForegroundColor Cyan
    Write-Host "    SELECT assert_baseline();         -- pass/fail" -ForegroundColor Cyan
    Write-Host "    SELECT * FROM baseline_report();  -- diagnostics" -ForegroundColor Cyan
}
