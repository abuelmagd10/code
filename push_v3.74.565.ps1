$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.565"') { Write-Host "+ 3.74.565" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_565.txt"
    $msgLines = @(
        'feat(fs): v3.74.565 - reports void filter + disposal metadata + IAS 21',
        '',
        'Financial statements audit + fixed assets audit sweep.',
        '',
        '  * income-statement + simple-report: add is_deleted filter to',
        '    match account-balances, trial-balance, general-ledger.',
        '  * dispose_asset RPC: write disposal_date, disposal_amount,',
        '    disposal_reason, disposal_journal_id back to fixed_assets;',
        '    JE lines stamp IAS 21 columns; period lock + SoD guard.',
        '  * FX revaluation deferred (large IAS 21 feature).',
        '',
        'Files',
        '  app/api/income-statement/route.ts',
        '  app/api/simple-report/route.ts',
        '  supabase/migrations/20260706000565_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.565'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.565 pushed" -ForegroundColor Green }
