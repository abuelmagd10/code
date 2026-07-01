$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.442.ps1") { Remove-Item -LiteralPath "push_v3.74.442.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.443"') {
    Write-Host "+ 3.74.443" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000443_v3_74_443_self_service_reactivation.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 443 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AP\. ?Self-service reactivation') {
    Write-Host "X CONTRACTS.md missing Section AP" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AP" -ForegroundColor Green

$api = "app/api/billing/reactivate/route.ts"
if (-not (Test-Path -LiteralPath $api)) { Write-Host "X API route missing" -ForegroundColor Red; exit 1 }
Write-Host "+ API /api/billing/reactivate present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_443.txt"
    $msgLines = @(
        'feat(billing): v3.74.443 - self-service reactivation',
        '',
        'renew_seat_licenses extended seat expiry but never touched',
        'companies.subscription_status, so paying to renew seats did',
        'not clear the payment_failed suspension. Owners stayed locked',
        'out until support intervened.',
        '',
        'RPC reactivate_company_subscription(company_id, performed_by)',
        '   requires >=1 seat_license.expires_at > NOW()',
        '   flips subscription_status = active, clears suspended_at',
        '   and past_due_at, extends current_period_end, resets the',
        '   three reminder_*_sent_at (fresh cycle)',
        '   reactivates company_seats.status',
        '   notifies owner + GM + admin (billing category)',
        '',
        'Trigger company_seat_license_auto_reactivate on',
        '   company_seat_licenses AFTER UPDATE OF expires_at',
        '   fires when expires_at moves into the future while the',
        '   company is past_due / payment_failed. Calls the RPC.',
        '   Covers the paymob webhook path without any webhook code',
        '   change.',
        '',
        'API POST /api/billing/reactivate (owner-only) as the manual',
        'fallback for coupon grants, direct DB fixes, and support',
        'actions that predate this release.',
        '',
        'Baseline (Section AP) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000443_v3_74_443_self_service_reactivation.sql',
        '   app/api/billing/reactivate/route.ts',
        '   CONTRACTS.md (Section AP added)',
        '   lib/version.ts -> 3.74.443'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.443 pushed - self-service reactivation live" -ForegroundColor Green
}
