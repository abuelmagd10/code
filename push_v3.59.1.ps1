# v3.59.1 - Make company_role_permissions the single source of truth
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

$mig = "supabase/migrations/20260528000800_ai_allowed_resources_use_configured_first.sql"
if (-not (Test-Path $mig)) { Write-Host "X $mig MISSING" -ForegroundColor Red; exit 1 }
Write-Host "+ $mig" -ForegroundColor Green

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$cps = Get-Content $mig -Raw
if ($cps -match 'v_has_config') { Write-Host "  + configured-first logic present" -ForegroundColor Green }
else { Write-Host "  X missing logic" -ForegroundColor Red; exit 1 }

$route = Get-Content "app/api/ai/find-page/route.ts" -Raw
if ($route -match 'rows\.length > 0') { Write-Host "  + API uses configured-first" -ForegroundColor Green }
else { Write-Host "  X API not updated" -ForegroundColor Red; exit 1 }
if ($route -match 'can_read, all_access') { Write-Host "  + API checks all three flags" -ForegroundColor Green }
else { Write-Host "  X API missing flags check" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String); exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add $mig app/api/ai/find-page/route.ts CHANGELOG.md
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(ai-assistant): v3.59.1 company_role_permissions is the source of truth

User feedback: the assistant should derive role-based suggestions
from the actual configured permissions in /settings/users -
not from hardcoded defaults that may not match what the admin set up.

Old behaviour:
  allowedResources = DEFAULT_ROLE_PAGES[role]
  + overrides from company_role_permissions

This let resources like 'shipping' (in store_manager's defaults) leak
to users even when the admin had not configured it in Settings.

New behaviour:
  If company_role_permissions has ANY rows for (role, company):
    use ONLY rows where can_access OR can_read OR all_access = TRUE
  Else (new company, nothing configured):
    fall back to DEFAULT_ROLE_PAGES[role]
  Always include 'dashboard'

Mirrored in both layers:
- DB function ai_current_user_allowed_resources() (RLS)
- TypeScript buildGovernanceContext() in /api/ai/find-page

Verified on production for company 8ef6338c-...:
- staff: 8 configured resources (no defaults leaked)
  customer_credits, customers, sales_orders, shipments, estimates,
  third_party_inventory, dashboard, inventory
- store_manager: 14 configured resources (no 'shipping' default leak)
  dashboard, inventory, write_offs, payments, warehouses,
  inventory_transfers, inventory_goods_receipt, purchase_returns,
  dispatch_approvals, cost_centers, customers, sales_orders,
  shipments, third_party_inventory

Safety:
- Owner/Admin/GM untouched (full access)
- Brand-new companies still get sensible defaults
- TypeScript: OK
- Admin /settings/users now is the canonical source" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.59.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test: as staff, ask 'فاتورة' - should only see configured pages" -ForegroundColor Cyan
    Write-Host "Test: as store_manager, ask 'شحن' - 'shipping' default no longer leaks" -ForegroundColor Cyan
}
