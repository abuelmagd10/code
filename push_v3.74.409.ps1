$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.408.ps1") { Remove-Item -LiteralPath "push_v3.74.408.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.409"') {
    Write-Host "+ 3.74.409" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000409_v3_74_409_security_invoker_stage2.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X missing migration" -ForegroundColor Red; exit 1 }
$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'v_bookings_full',
    'v_service_revenue_summary',
    'v_staff_performance',
    'v_branch_occupancy_rate',
    'v_commission_summary_by_employee',
    'v_invoices_with_cogs',
    'v_cogs_journal_entries'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers 7 stage-2 views" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'المرحلة 2 — 7 فيوهات تقارير') {
    Write-Host "X CONTRACTS.md missing Stage 2 entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Stage 2 entry" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_409.txt"
    $msgLines = @(
        'security(views): v3.74.409 - stage 2 SECURITY DEFINER cleanup',
        '',
        'Stage 2 of the 12 SECURITY DEFINER views flagged by Supabase',
        'Security Advisor. 7 reporting views switched to',
        'security_invoker=true:',
        '  v_bookings_full',
        '  v_service_revenue_summary',
        '  v_staff_performance',
        '  v_branch_occupancy_rate',
        '  v_commission_summary_by_employee',
        '  v_invoices_with_cogs',
        '  v_cogs_journal_entries',
        '',
        'All base tables (bookings, invoices, services, branches,',
        'employees, journal_entries, commission_*) have RLS enabled,',
        'so the per-company / per-user scoping that the views used to',
        'bypass now applies on read.',
        '',
        'Section Q baseline expanded to cover the new 7 views in',
        'addition to the 3 from v3.74.408 - any future migration that',
        'drops the option will be caught.',
        '',
        'Remaining',
        '  Stage 3: dashboard_gl_period_summary + v_erp_integrity_monitor',
        '           (the two system views that may legitimately require',
        '           SECURITY DEFINER; we will redesign before flipping).',
        '',
        'Files',
        '  supabase/migrations/20260629000409_v3_74_409_security_invoker_stage2.sql',
        '  CONTRACTS.md (Stage 2 entry)',
        '  lib/version.ts -> 3.74.409'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.409 pushed - 7 stage-2 views switched to security_invoker" -ForegroundColor Green
    Write-Host "  Smoke test: open booking reports, sales reports, COGS reports, commission reports — values should be identical." -ForegroundColor Cyan
}
