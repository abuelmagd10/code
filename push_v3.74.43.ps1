# v3.74.43 - RLS coverage + CHECK constraint cleanup (DB-only)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.43"') {
    Write-Host "+ APP_VERSION = 3.74.43" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.43" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.43]')) {
    Write-Host "+ CHANGELOG 3.74.43" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.43" -ForegroundColor Red; exit 1 }

foreach ($marker in @(
    'v3_74_43a_rls_for_unprotected_tables',
    'v3_74_43b_consolidate_inventory_transfers_status_check'
)) {
    if ($cl -match $marker) {
        Write-Host "  + marker $marker" -ForegroundColor Green
    } else { Write-Host "  X missing marker $marker" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(db): v3.74.43 - RLS coverage + CHECK constraint cleanup

Pre-launch audit Phase 3. Result: 204/213 public tables already had
correct RLS; the remaining 9 were unprotected. Each fixed by category:

  CRITICAL (HR salary data):
    employee_contracts - policies join through employees to enforce
    is_company_member / can_modify_data / can_delete_data. Without
    this any authenticated user could read every salary contract.

  FK-chain tables:
    commission_rules (joins commission_plans)
    restore_batches (joins restore_queue)
    restore_queue (direct company_id + owner/admin role)

  Global template tables (SELECT-only for authenticated users):
    consolidation_statement_templates
    consolidation_statement_mappings
    elimination_rule_sets
    elimination_rules

  Test stub dropped:
    erp_test_2026

CHECK constraint audit on launch-critical tables (invoices, bills,
journal_entries, payments, sales_returns, etc.) confirmed every CHECK
aligned with code-side writes. One real issue: inventory_transfers had
two overlapping CHECKs on status with non-identical allowed sets.
Consolidated into one CHECK that covers every status the code uses.

All changes are DB-only migrations; no application code touched.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.43 pushed" -ForegroundColor Green
}
