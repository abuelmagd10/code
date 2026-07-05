$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.550"') { Write-Host "+ 3.74.550" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000550_v3_74_550_daily_income_use_payments_journal_link.sql')) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_550.txt"
    $msgLines = @(
        'fix(dashboard): v3.74.550 - daily movement finds voided JE via payments link',
        '',
        'v3.74.548 hid voided originals by matching JE.reference_type=payment',
        'against payment_ids. Reality: the original bill-payment JE in this',
        'system uses reference_type=bill_payment with reference_id pointing',
        'at the bill, so the filter missed it and 07-03 showed both the',
        'voided original (-4.93) and the corrected repost (-3.00) = -7.93.',
        '',
        'Rewrite: query payments.journal_entry_id IN (fetched JE ids) and',
        'drop any JE whose linked payment has voided_at set. Works',
        'regardless of what reference_type the JE happens to use.',
        '',
        'Files',
        '  lib/dashboard-daily-income.ts',
        '  supabase/migrations/20260706000550_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.550'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.550 pushed" -ForegroundColor Green }
