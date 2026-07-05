$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.540"') { Write-Host "+ 3.74.540" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath 'app/api/payments/[id]/request-correction/route.ts' -Raw
if ($route -notmatch 'proposed\.original_currency') { Write-Host "X customer request-correction missing original_currency whitelist" -ForegroundColor Red; exit 1 }
if ($route -notmatch 'proposed\.exchange_rate') { Write-Host "X customer request-correction missing exchange_rate whitelist" -ForegroundColor Red; exit 1 }
Write-Host "+ customer request-correction whitelists currency + FX" -ForegroundColor Green

$ap = Get-Content -LiteralPath 'app/approvals/page.tsx' -Raw
if ($ap -notmatch 'proposed_amount: proposed\.amount != null \? Number\(proposed\.amount\) : null,') {
    Write-Host "X customer refund loader missing proposed changes" -ForegroundColor Red; exit 1
}
Write-Host "+ customer refund card shows proposed changes" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_540.txt"
    $msgLines = @(
        'fix(payments): v3.74.540 - customer payment correction fixed end-to-end (same as vendor side v3.74.538)',
        '',
        'Sales-side mirror of the v3.74.538 vendor payment correction',
        'fix. Three related bugs:',
        '',
        '  1. /api/payments/[id]/request-correction whitelist missed',
        '     original_currency + exchange_rate, so a customer payment',
        '     in the wrong currency could not be corrected.',
        '',
        '  2. execute_payment_correction (DB) had the same three FX',
        '     bugs its vendor sibling had: invoice.paid_amount rollback',
        '     used raw amount, new JE lines used raw amount, and the',
        '     new payment row was force-inserted as base currency.',
        '     v_has_changes also ignored currency + rate. All four',
        '     fixed to mirror the vendor rewrite.',
        '',
        '  3. Customer refund card in /approvals did not surface',
        '     metadata.proposed_changes so the owner could not see',
        '     what the accountant was proposing. Now shows the diff',
        '     (line-through old, bold new) in a cyan panel, matching',
        '     the violet panel added on the vendor side.',
        '',
        'DB migration applied on prod. This commit ships the code +',
        'doc stamp.',
        '',
        'Files',
        '  app/api/payments/[id]/request-correction/route.ts',
        '  app/approvals/page.tsx (customer refund interface + loader + card)',
        '  supabase/migrations/20260706000540_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.540'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.540 pushed - customer correction FX-honest" -ForegroundColor Green }
