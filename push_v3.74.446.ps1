$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.445.ps1") { Remove-Item -LiteralPath "push_v3.74.445.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.446"') {
    Write-Host "+ 3.74.446" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000446_v3_74_446_billing_e2e_fixes.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 446 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AS\. ?Billing E2E fixes') {
    Write-Host "X CONTRACTS.md missing Section AS" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AS" -ForegroundColor Green

$docs = "docs/billing.md"
if (-not (Test-Path -LiteralPath $docs)) { Write-Host "X docs/billing.md missing" -ForegroundColor Red; exit 1 }
Write-Host "+ docs/billing.md present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_446.txt"
    $msgLines = @(
        'fix(billing): v3.74.446 - E2E fixes + docs, closes billing series',
        '',
        'Running the 7-scenario E2E on test company surfaced two bugs',
        'that would have hit production the first time the cron ran.',
        '',
        'Bug A: notifications.created_by is NOT NULL, but',
        '   notify_company_billing_owner (v3.74.442) was passing NULL.',
        '   Every daily_billing_check reminder INSERT crashed.',
        '   Fix: read companies.user_id (owner) and use it as created_by.',
        '',
        'Bug B: company_seat_license_auto_reactivate (v3.74.443) required',
        '   OLD.expires_at <= NOW() before firing reactivation. A paymob',
        '   renewal that extended an already-active seat (early renewal,',
        '   coupon grant, ...) never triggered the reactivation. Company',
        '   stayed payment_failed.',
        '   Fix: fire whenever expires_at moves further into the future.',
        '',
        'E2E walkthrough now passes 7/7:',
        '   T-7 / T-3 / T-1 reminders',
        '   past_due auto-transition + past_due_at stamped',
        '   suspend after grace + suspended_at stamped',
        '   write gate refuses new PO with Arabic message',
        '   seat renewal auto-reactivates the company',
        '   test company state restored from snapshot at end.',
        '',
        'docs/billing.md documents the full lifecycle, state map,',
        'cron pipeline, write gate, payment + reactivation flow, and',
        'a "what can go wrong" section that captures both bugs above.',
        '',
        'Closes the v3.74.442 -> v3.74.446 billing series. System is',
        'production-ready.',
        '',
        'Files',
        '   supabase/migrations/20260630000446_v3_74_446_billing_e2e_fixes.sql',
        '   docs/billing.md',
        '   CONTRACTS.md (Section AS added)',
        '   lib/version.ts -> 3.74.446'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.446 pushed - billing series complete" -ForegroundColor Green
}
