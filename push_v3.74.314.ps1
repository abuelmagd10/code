$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.313.ps1") { Remove-Item -LiteralPath "push_v3.74.313.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.314"') {
    Write-Host "+ 3.74.314" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260624000314_v3_74_314_booking_officer_add_sales_orders.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    "CREATE OR REPLACE FUNCTION public.seed_booking_officer_permissions",
    "'booking_officer', 'sales_orders'",
    "Backfill"
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: booking_officer.sales_orders seeded + backfilled" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_314.txt"
    $msgLines = @(
        'feat(rbac): v3.74.314 - booking_officer can access /sales-orders',
        '',
        'Foundation step for the unified bookings UX the owner planned',
        'out. The new booking_officer role is supposed to mirror the',
        'staff role: see only what he creates (own visibility), with a',
        'workspace that includes customers + bookings + sales-orders +',
        'services.',
        '',
        'Existing seed (migration 20260515000500) granted bookings,',
        'services, customers, payments, reports, dashboard. This',
        'migration adds the missing sales_orders permission so the role',
        'can land on /sales-orders, where v3.74.316 will introduce a new',
        '"أوامر الحجز" tab.',
        '',
        'RLS still keeps the row-level scope: sales_orders.created_by_',
        'user_id = auth.uid() for own visibility. We only added the',
        'page-level access permission.',
        '',
        'Backfill block covers any company that already had a booking_',
        'officer member from before this change.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000314_v3_74_314_booking_officer_add_sales_orders.sql (NEW)',
        '  lib/version.ts -> 3.74.314'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.314 pushed" -ForegroundColor Green
}
