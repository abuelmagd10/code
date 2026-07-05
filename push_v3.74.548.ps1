$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.548"') { Write-Host "+ 3.74.548" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000548_v3_74_548_daily_income_excludes_reversals_and_voids.sql')) {
    Write-Host "X doc-stamp migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ doc-stamp migration present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_548.txt"
    $msgLines = @(
        'fix(dashboard): v3.74.548 - daily income excludes reversals + voided originals',
        '',
        'Dashboard cash+bank daily income widget still displayed 4.93 EGP on',
        '2026-07-05 - the reversal-cash-in side of the correction. The widget',
        'reads GL directly and could not tell that the JE was a rollback.',
        '',
        'Fix (lib/dashboard-daily-income.ts)',
        '  1. Add .neq(reference_type, ''payment_reversal'') on the JE fetch',
        '     - kills the VOID reversal from the day view.',
        '  2. After fetch, look up payments referenced by',
        '     reference_type = ''payment'' JEs and drop any whose voided_at',
        '     is set - kills the original from its payment_date.',
        '  3. Keep payment_correction_repost as the sole business event',
        '     for the corrected amount.',
        '',
        'Files',
        '  lib/dashboard-daily-income.ts        (JE filter + voided lookup)',
        '  supabase/migrations/20260706000548_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.548'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.548 pushed" -ForegroundColor Green }
