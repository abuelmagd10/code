$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.555"') { Write-Host "+ 3.74.555" -ForegroundColor Green }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_555.txt"
    $msgLines = @(
        'feat(returns): v3.74.555 - refund account dropdown filters by method + ccy',
        '',
        'Purchase-return dialog (bills page): the refund-account dropdown',
        'listed every account regardless of method or currency. Now:',
        '  method=cash → cash-type accounts only',
        '  method=bank → bank-type accounts only',
        '  AND account currency == selected returnCurrency.',
        'Shows a helpful placeholder when no account matches.',
        '',
        'Sales-return dialog (invoice page): already filtered by cash/bank',
        'but not by currency; added currency match to mirror the payment',
        'dialog on the same page.',
        '',
        'Files',
        '  app/bills/[id]/page.tsx',
        '  app/invoices/[id]/page.tsx',
        '  supabase/migrations/20260706000555_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.555'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.555 pushed" -ForegroundColor Green }
