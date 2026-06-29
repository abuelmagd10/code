$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.390.ps1") { Remove-Item -LiteralPath "push_v3.74.390.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.391"') {
    Write-Host "+ 3.74.391" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000391_v3_74_391_suppliers_rls_per_branch.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 391" -ForegroundColor Green
} else { Write-Host "X missing migration 391" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'can_manage_supplier_row',
    "v_role IN ('owner', 'admin', 'general_manager')",
    "v_role IN ('manager', 'accountant', 'purchasing_officer')",
    'p_row_branch_id = v_user_branch_id',
    'suppliers_insert',
    'suppliers_update',
    'suppliers_delete'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers function + all 3 DML policies" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_391.txt"
    $msgLines = @(
        'feat(rls): v3.74.391 - branch-scoped supplier management',
        '',
        'Owner pulled back on the broad v3.74.390 grant for suppliers and',
        'specified exactly who can add/edit/delete suppliers:',
        '  Company-level (any branch, including NULL branch):',
        '    owner, admin, general_manager',
        '  Branch-level (only suppliers on the user''s own branch):',
        '    manager, accountant, purchasing_officer',
        '  Everyone else: read-only.',
        '',
        'Implementation',
        '  New function can_manage_supplier_row(company_id, branch_id):',
        '    - returns true for companies.user_id always',
        '    - returns true for the 3 company-level roles regardless',
        '      of the row''s branch_id',
        '    - for the 3 branch-level roles, requires the user has a',
        '      branch_id on company_members AND that branch matches',
        '      the row''s branch_id. NULL branch on the row blocks',
        '      branch-level users (only company-level can manage',
        '      shared suppliers).',
        '    - returns false for everyone else.',
        '  Suppliers INSERT/UPDATE/DELETE policies replaced with',
        '  WITH CHECK / USING calling the new helper. SELECT policy',
        '  unchanged - any company member can still view the list.',
        '',
        'Why not extend can_modify_data',
        '  can_modify_data is parameterless on the row (only takes',
        '  company_id) and is used by 22 tables. The supplier rule',
        '  needs the row''s branch_id, so we keep can_modify_data alone',
        '  and override suppliers'' policies specifically.',
        '',
        'Compatibility',
        '  v3.74.390''s extension of can_modify_data (added the modern',
        '  operational roles to global write) still applies to the',
        '  other 21 tables — purchasing officer can still create POs,',
        '  bills, vendor credits, etc. Only suppliers is now locked',
        '  down to the explicit role + branch combination.',
        '',
        'Files',
        '  supabase/migrations/20260629000391_v3_74_391_suppliers_rls_per_branch.sql',
        '  lib/version.ts -> 3.74.391',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.391 pushed - suppliers RLS branch-scoped" -ForegroundColor Green
}
