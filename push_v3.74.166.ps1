$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.165.ps1") { Remove-Item -LiteralPath "push_v3.74.165.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.166"') { Write-Host "+ 3.74.166" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000166_v3_74_166_store_manager_purchase_returns.sql")) {
    Write-Host "X migration file missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration file present" -ForegroundColor Green

$access = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
if ($access -notmatch "store_manager:[\s\S]{0,500}'purchase_returns'") {
    Write-Host "X store_manager default in access-context.tsx missing purchase_returns" -ForegroundColor Red
    exit 1
}
Write-Host "+ store_manager fallback includes purchase_returns" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_166.txt"
    $msgLines = @(
        "fix(governance): v3.74.166 - store_manager default includes purchase_returns",
        "",
        "Tester report: owner approved a purchase return; store_manager",
        "for the bill's branch received the 'goods receipt approval'",
        "notification correctly, but clicking it did not open the right",
        "page. Root cause: /purchase-returns/{id} maps to resource",
        "'purchase_returns' for the page guard, and store_manager's",
        "default page list never included that resource, even though",
        "store_manager is the warehouse-side approver for the return.",
        "",
        "Fix applies in three places so the gap is closed for every",
        "code path that reads role defaults:",
        "",
        "1. lib/access-context.tsx",
        "   - defaultRolePages.store_manager gains 'purchase_returns'.",
        "   - This is the JS fallback used when a role has zero rows in",
        "     company_role_permissions (legacy companies before the",
        "     v3.68.0 seed trigger).",
        "",
        "2. supabase/migrations/20260615000166_v3_74_166_store_manager_purchase_returns.sql",
        "   - seed_default_role_permissions() rewritten so newly created",
        "     companies and any company that re-runs the seed get the",
        "     store_manager.purchase_returns row from the start.",
        "   - Backfill insert for every existing company whose",
        "     store_manager row for purchase_returns was missing. Idempotent",
        "     (skipped when the row already exists).",
        "",
        "3. lib/version.ts",
        "   - Bumped to 3.74.166.",
        "",
        "Schema of the new permission row:",
        "  role='store_manager', resource='purchase_returns',",
        "  can_access=true, can_read=true, can_write=true, can_update=true,",
        "  can_delete=false (matches the existing sales_return_requests",
        "  warehouse-approver row).",
        "",
        "How to verify:",
        "  - As store_manager in the bill's branch, click a 'goods",
        "    receipt approval' notification on a purchase return.",
        "  - The router opens /purchase-returns/{id} successfully (no",
        "    permission redirect, no toast 'Cannot navigate').",
        "  - The sidebar entry 'مرتجعات المشتريات' is visible for the",
        "    store_manager role.",
        "  - Existing companies in DB now show one extra row in",
        "    company_role_permissions for every store_manager role x",
        "    purchase_returns combination."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.166 pushed" -ForegroundColor Green
}
