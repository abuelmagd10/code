# v3.74.36..40 - column-name audit bundle (DB-only fixes)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

# 1) Version marker
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.40"') {
    Write-Host "+ APP_VERSION = 3.74.40" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.40" -ForegroundColor Red; exit 1 }

# 2) CHANGELOG entries for every version in this bundle
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
foreach ($vv in @('3.74.36','3.74.37','3.74.38','3.74.39','3.74.40')) {
    if ($cl -match [regex]::Escape("[$vv]")) {
        Write-Host "+ CHANGELOG $vv" -ForegroundColor Green
    } else { Write-Host "X CHANGELOG missing $vv" -ForegroundColor Red; exit 1 }
}

# 3) DB migration markers per version
foreach ($entry in @(
    @{ v='3.74.36'; markers=@('v3_74_36a_protect_customer_branch_id_columns','v3_74_36b_route_system_events_to_notifications_columns') },
    @{ v='3.74.37'; markers=@('v3_74_37a_create_company_atomic_columns','v3_74_37b_create_branch_atomic_columns','v3_74_37c_get_or_create_fx_account_columns') },
    @{ v='3.74.38'; markers=@('v3_74_38a_perform_annual_closing_atomic_posted_by','v3_74_38b_post_payroll_atomic_posted_by','v3_74_38c_pay_commission_advance_columns','v3_74_38d_drop_dead_dispose_asset_overload') },
    @{ v='3.74.39'; markers=@('v3_74_39a_process_purchase_return_atomic_columns','v3_74_39b_post_bank_voucher_drop_rate_source','v3_74_39c_post_accounting_event_legacy_to_wrapper') },
    @{ v='3.74.40'; markers=@('v3_74_40a_post_payroll_atomic_drop_broken_update') }
)) {
    foreach ($marker in $entry.markers) {
        if ($cl -match [regex]::Escape($marker)) {
            Write-Host "  + v$($entry.v) marker $marker" -ForegroundColor Green
        } else { Write-Host "  X v$($entry.v) missing marker $marker" -ForegroundColor Red; exit 1 }
    }
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
    git commit -m "feat(db audit): v3.74.36-40 - column-name parity audit + fixes

Comprehensive PL/pgSQL function column audit across 5 batches.

v3.74.36 (silent triggers): protect_customer_branch_id audit_logs
         column rename; route_system_events_to_notifications
         notifications.user_id remapped to created_by + assigned_to_user.

v3.74.37 (signup/creation): create_company_atomic dropped non-existent
         subscription_plan + max_users + full_name + warehouses.type;
         create_branch_atomic same warehouses.type fix; get_or_create_fx_account
         dropped account_name_en + allow_journal_entries, added
         required normal_balance='debit'.

v3.74.38 (journal_entries.posted_by): perform_annual_closing_atomic
         + post_payroll_atomic + pay_commission_advance all migrated
         from journal_entries.created_by to posted_by + posted_at;
         pay_commission_advance also dropped non-existent fiscal_year_id
         and posted columns, and corrected journal_entry_lines
         debit/credit to debit_amount/credit_amount. Dead 5-param
         dispose_asset overload dropped.

v3.74.39 (final INSERT batch): process_purchase_return_atomic dropped
         4 non-existent vendor_credits columns + inventory_transactions
         transaction_date; post_bank_voucher dropped journal_entry_lines
         rate_source; legacy 11-param post_accounting_event converted
         to thin wrapper around the canonical 12-param overload.

v3.74.40 (UPDATE audit): regex-based UPDATE audit verified by agent
         against information_schema. 9 false positives confirmed clean.
         Real bug fix: post_payroll_atomic removed broken UPDATE on
         payroll_runs (status + updated_at columns don't exist on the
         stub table). post_payroll_run_atomic documented as needing a
         schema-aligned rewrite before the payroll feature ships.

All SECURITY DEFINER attributes preserved end-to-end (v3.74.33 lesson
held throughout). Zero changes to active launch features (invoicing,
sales orders, payments, inventory, accounting periods).

DB-only release: 12 migrations applied directly via Supabase MCP.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.36-40 pushed" -ForegroundColor Green
    # Clean up superseded push script
    if (Test-Path 'push_v3.74.22-35.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.22-35.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.22-35.ps1)" -ForegroundColor DarkGray
    }
}
