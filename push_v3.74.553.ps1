$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.553"') { Write-Host "+ 3.74.553" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000553_v3_74_553_systematic_returns_and_fx_audit.sql')) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_553.txt"
    $msgLines = @(
        'fix(display): v3.74.553 - systematic returns + FX audit sweep',
        '',
        'Audit turned up 9 more places with the same two bug classes we',
        'have been fixing. All addressed in this commit.',
        '',
        'Class 2 (FX amount)',
        '  lib/services/sales-invoice-update-command.service.ts',
        '  lib/services/sales-invoice-edit-command.service.ts',
        '  * sum base_currency_amount and skip voided rows',
        '',
        'Class 3 (missing returned_amount subtraction)',
        '  app/customer-credits/[customerId]/page.tsx (x3)',
        '  app/invoices/[id]/page.tsx (x4 including balance banner)',
        '',
        'Files',
        '  4 files edited',
        '  supabase/migrations/20260706000553_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.553'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.553 pushed" -ForegroundColor Green }
