$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.546"') { Write-Host "+ 3.74.546" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000546_v3_74_546_correction_fx_rate_inheritance.sql')) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_546.txt"
    $msgLines = @(
        'fix(corrections): v3.74.546 - FX rate inheritance corrupted new payment',
        '',
        'After v3.74.545 the correction executed end-to-end but stamped the',
        'new payment with base=147.84 EGP against a 3-EGP amount. Trigger:',
        'the user proposed { amount:3, original_currency:EGP } with NO',
        'exchange_rate. The RPC fell back to v_original.exchange_rate (49.28,',
        'valid only for the old USD→EGP conversion) and multiplied it by',
        'the new EGP amount.',
        '',
        'Root cause: exchange_rate belongs to the ORIGINAL currency; when',
        'the currency changes, the old rate does not apply.',
        '',
        'New rate logic (mirrored on customer side)',
        '  1. New ccy == company base ccy      -> rate = 1',
        '  2. User supplied a valid rate       -> use it',
        '  3. Currency was NOT changed         -> keep original',
        '  4. Currency changed, no rate given  -> default to 1',
        '',
        'Also moved the base_ccy lookup BEFORE the rate calculation so',
        'branch (1) can see it.',
        '',
        'One-off data repair applied to the test company:',
        '  payment 03221a4e-.. base 3.00, rate 1',
        '  JE 59917668-.. lines 3.00 each',
        '  bill 4579b8d0-.. paid_amount rebuilt from truth',
        '  trial balance verified balanced (30021.23 = 30021.23)',
        '',
        'Files',
        '  supabase/migrations/20260706000546_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.546'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.546 pushed" -ForegroundColor Green }
