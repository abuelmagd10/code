$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.563"') { Write-Host "+ 3.74.563" -ForegroundColor Green }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_563.txt"
    $msgLines = @(
        'feat(reservations): v3.74.561-563 - bank vouchers, expenses, write-offs, manufacturing',
        '',
        'Continuing the systematic sweep into modules we had not yet',
        'covered. All four modules already had solid guards (SoD +',
        'delete + immutable + branch isolation). Gaps filled here:',
        '',
        '#1 Bank Vouchers',
        '  * approvals card: display base_amount (was mixing FC).',
        '  * approve notification: send base_amount.',
        '  * cash-balance-validator only counts pending/approved',
        '    vouchers (posted are already in GL).',
        '',
        '#2 Expenses',
        '  * /expenses list: total sums base_currency_amount.',
        '',
        '#3 Manufacturing',
        '  * effective stock helper reserves BOM components for',
        '    pending material issue approvals.',
        '',
        '#4 Inventory Write-offs',
        '  * effective stock helper reserves pending write-off qty.',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  app/api/banking/vouchers/[id]/workflow/route.ts',
        '  app/expenses/page.tsx',
        '  lib/accounting/cash-balance-validator.ts',
        '  supabase/migrations/20260706000562_...sql',
        '  supabase/migrations/20260706000563_...sql',
        '  lib/version.ts -> 3.74.563'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.563 pushed" -ForegroundColor Green }
