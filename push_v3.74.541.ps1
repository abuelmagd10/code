$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.541"') { Write-Host "+ 3.74.541" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath 'app/vendor-payment-correction-requests/page.tsx' -Raw
if ($page -notmatch '__original_currency') { Write-Host "X vpcr interface missing __original_currency" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'base_currency_amount') { Write-Host "X vpcr loader not fetching base_currency_amount" -ForegroundColor Red; exit 1 }
Write-Host "+ vpcr page enriched" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_541.txt"
    $msgLines = @(
        'feat(vpcr): v3.74.541 - vendor correction requests page shows currency, base equivalent, and proposed diff',
        '',
        'Owner opened the notification and landed on /vendor-payment-',
        'correction-requests. The amount column showed a naked "0.10"',
        'with no currency, no base-EGP conversion, and no hint that the',
        'accountant proposed changing it to 3 EGP.',
        '',
        'Fix (UI only, same enrichment pattern as v3.74.539 for the',
        '/approvals inbox card):',
        '  Interface: __original_currency / __base_amount / __exchange_rate',
        '    populated by a second query.',
        '  Loader: batches payments by original_payment_id and resolves',
        '    the FX context for every row.',
        '  Amount column renders three lines:',
        '    "0.10 USD" primary',
        '    "≈ 4.93 EGP · FX 49.2800" secondary (non-EGP only)',
        '    "→ 3 EGP" violet (when metadata.proposed_changes has amount',
        '    or original_currency)',
        '',
        'Files',
        '  app/vendor-payment-correction-requests/page.tsx',
        '  supabase/migrations/20260706000541_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.541'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.541 pushed - vpcr page shows the whole picture" -ForegroundColor Green }
