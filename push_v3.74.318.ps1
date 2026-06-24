$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.313.ps1","push_v3.74.314.ps1","push_v3.74.315.ps1","push_v3.74.316.ps1","push_v3.74.317.ps1")) {
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.318"') {
    Write-Host "+ 3.74.318" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# تأكد إن الـ 5 migration files موجودة (314 -> 318)
$migrations = @(
    "supabase/migrations/20260624000314_v3_74_314_booking_officer_add_sales_orders.sql",
    "supabase/migrations/20260624000315_v3_74_315_booking_officer_services_read_only.sql",
    "supabase/migrations/20260624000316_v3_74_316_services_write_for_manager_admin_accountant.sql",
    "supabase/migrations/20260624000317_v3_74_317_general_manager_role_and_services_scope.sql",
    "supabase/migrations/20260624000318_v3_74_318_services_admin_is_general_manager.sql"
)
foreach ($m in $migrations) {
    if (-not (Test-Path -LiteralPath $m)) {
        Write-Host "X migration missing: $m" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all 5 migrations present (314..318)" -ForegroundColor Green

# تأكيدات على الـ migration النهائى
$mig318 = Get-Content -LiteralPath $migrations[4] -Raw
foreach ($n in @(
    "admin IS the general manager",
    "DELETE FROM public.company_role_permissions",
    "WHERE role = 'general_manager'",
    "booking_officer on services"
)) {
    if ($mig318 -notmatch [regex]::Escape($n)) {
        Write-Host "X v3.74.318 migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ v3.74.318 migration: admin restored, general_manager cleaned" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_318.txt"
    $msgLines = @(
        'feat(rbac+services): v3.74.314..318 - bookings officer wiring + services scope',
        '',
        'Five linked migrations on the path to the new unified bookings UX.',
        'Squashed under one push so the DB and the repo land together.',
        '',
        'v3.74.314 — booking_officer can access /sales-orders',
        '  Adds the page-level permission so the future "أوامر الحجز" tab',
        '  is reachable. Row-level RLS still scopes to own visibility.',
        '',
        'v3.74.315 — booking_officer is read-only on services',
        '  Owner clarified: booking_officer never creates services, only',
        '  consumes them. Pulled write/update/delete; the services page',
        '  already gates Add/Edit buttons via canAction(), so the buttons',
        '  disappear automatically for this role.',
        '',
        'v3.74.316 — exploratory: manager + admin + accountant can write',
        '  Initial pass after asking the owner who should create services.',
        '  Superseded by v3.74.318 once the actual UI labels were checked.',
        '',
        'v3.74.317 — general_manager wired as a first-class role',
        '  general_manager was already referenced in 15+ frontend files',
        '  but had no DB recognition: missing from the role CHECK',
        '  constraints AND from the visibility function. This migration:',
        '    - widens the role CHECK on company_members + company_role_',
        '      permissions to include general_manager',
        '    - teaches current_user_resource_visibility() that',
        '      general_manager has company-wide scope (same as owner/admin)',
        '  Kept as defense-in-depth even after v3.74.318 — harmless if no',
        '  members ever take this role.',
        '',
        'v3.74.318 — correction: admin IS the "مدير عام" label',
        '  Owner pointed out the user-management dropdown already labels',
        '  role=admin as "مدير عام". v3.74.317 had stripped admin of',
        '  write on services on the wrong premise. This migration:',
        '    - restores admin to full perms on services (the role that',
        '      actually wears the "مدير عام" hat in the UI)',
        '    - inserts an admin/services row for any legacy company that',
        '      was missing one',
        '    - cleans up the orphan general_manager rows v3.74.317',
        '      inserted (no member ever assumed that role)',
        '    - backfills booking_officer/services (read-only) for any',
        '      legacy company so the role can browse services when',
        '      booking',
        '',
        'Final state on services after this push:',
        '  owner             — full (implicit)',
        '  admin             — full (= "مدير عام" in UI)',
        '  manager           — full (= "مدير", branch-scoped)',
        '  accountant        — read only',
        '  booking_officer   — read only',
        '  store_manager / purchasing_officer / staff / viewer / etc — unchanged',
        '',
        'All migrations were applied directly to production before this',
        'push; verified state on Test Company.',
        '',
        'Files',
        '  supabase/migrations/20260624000314_*.sql (NEW)',
        '  supabase/migrations/20260624000315_*.sql (NEW)',
        '  supabase/migrations/20260624000316_*.sql (NEW)',
        '  supabase/migrations/20260624000317_*.sql (NEW)',
        '  supabase/migrations/20260624000318_*.sql (NEW)',
        '  lib/version.ts -> 3.74.318'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.318 pushed" -ForegroundColor Green
}
