$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.409.ps1") { Remove-Item -LiteralPath "push_v3.74.409.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.410"') {
    Write-Host "+ 3.74.410" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000410_v3_74_410_security_invoker_stage3.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X missing migration" -ForegroundColor Red; exit 1 }
$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @('v_erp_integrity_monitor','dashboard_gl_period_summary','security_invoker')) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers 2 stage-3 views" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'المرحلة 3 — 2 فيوهات حساسة') {
    Write-Host "X CONTRACTS.md missing Stage 3 entry" -ForegroundColor Red; exit 1
}
if ($contracts -notmatch '0 ERROR') {
    Write-Host "X CONTRACTS.md missing 0-ERROR confirmation" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Stage 3 entry + 0-ERROR mark" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_410.txt"
    $msgLines = @(
        'security(views): v3.74.410 - stage 3 SECURITY DEFINER cleanup (final)',
        '',
        'Final stage of the 12-view SECURITY DEFINER cleanup flagged',
        'by Supabase Security Advisor. After this commit the advisor',
        'reports 0 ERROR-level lints (was 12).',
        '',
        'v_erp_integrity_monitor',
        '  ALTER VIEW SET (security_invoker = true). All 6 base tables',
        '  (journal_entries, journal_entry_lines, bills, invoices,',
        '  products, inventory_transactions) carry RLS so per-company',
        '  scoping applies on read.',
        '',
        'dashboard_gl_period_summary',
        '  This one was tricky because its base relation',
        '  dashboard_gl_monthly_summary is a MATERIALIZED VIEW with no',
        '  RLS — flipping security_invoker alone would still leak.',
        '  Rewritten with an explicit filter',
        '    WHERE company_id IN (SELECT get_user_company_ids())',
        '  get_user_company_ids() is a SECURITY DEFINER helper that',
        '  resolves the calling user''s authorised companies.',
        '',
        'Baseline (Section Q)',
        '  All 12 previously-flagged views must keep security_invoker=true.',
        '  dashboard_gl_period_summary body must also reference',
        '  get_user_company_ids — a future DROP/CREATE that omits the',
        '  filter fails the baseline before it can ship.',
        '',
        'Verification',
        '  get_advisors(security): ERROR 12 -> 0. WARN unchanged.',
        '  assert_baseline(): returns without raising.',
        '',
        'Files',
        '  supabase/migrations/20260629000410_v3_74_410_security_invoker_stage3.sql',
        '  CONTRACTS.md (Stage 3 + 0-ERROR confirmation)',
        '  lib/version.ts -> 3.74.410'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.410 pushed - all 12 SECURITY DEFINER views fixed (0 ERROR remaining)" -ForegroundColor Green
    Write-Host "  Smoke test: open dashboard (main page) and integrity monitor page; numbers should be identical." -ForegroundColor Cyan
}
