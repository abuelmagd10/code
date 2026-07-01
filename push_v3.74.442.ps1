$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.440.ps1") { Remove-Item -LiteralPath "push_v3.74.440.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.442"') {
    Write-Host "+ 3.74.442" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000442_v3_74_442_grace_period_reminders.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 442 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AO\. ?Grace period') {
    Write-Host "X CONTRACTS.md missing Section AO" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AO" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_442.txt"
    $msgLines = @(
        'feat(billing): v3.74.442 - grace period + auto reminders',
        '',
        'Owner discovered the test company had been silently suspended',
        'after a payment failure with no warning, no grace period, and',
        'no self-service recovery. Would break every real customer that',
        'hit a card decline.',
        '',
        'Schema',
        '   companies + past_due_at, reminder_7d/3d/1d_sent_at',
        '   subscription_plans + grace_period_days (default 7)',
        '',
        'Helper',
        '   notify_company_billing_owner writes a billing-category',
        '   notification to every owner/GM/admin of the company.',
        '',
        'Cron',
        '   daily_billing_check runs at 06:00 UTC every day via pg_cron.',
        '   Idempotent five-step pipeline:',
        '     T-7 / T-3 / T-1 reminders (guarded by *_sent_at columns)',
        '     mark past_due when period_end < now',
        '     suspend after past_due + grace_period_days',
        '',
        'Every transition emits an Arabic notification to the owner.',
        '',
        'Baseline (Section AO) checks the schema, helper, cron job.',
        '',
        'Files',
        '   supabase/migrations/20260630000442_v3_74_442_grace_period_reminders.sql',
        '   CONTRACTS.md (Section AO added)',
        '   lib/version.ts -> 3.74.442'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.442 pushed - billing reminders live" -ForegroundColor Green
}
