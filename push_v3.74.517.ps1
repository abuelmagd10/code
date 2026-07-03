$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.516.ps1") { Remove-Item -LiteralPath "push_v3.74.516.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.517"') {
    Write-Host "+ 3.74.517" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$exp = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
if ($exp -notmatch 'showAllPayAccounts' -or $exp -notmatch 'original_currency') {
    Write-Host "X expenses page missing currency-account matching" -ForegroundColor Red; exit 1
}
$drw = Get-Content -LiteralPath "app/drawings/new/page.tsx" -Raw
if ($drw -notmatch 'showAllPayAccounts' -or $drw -notmatch 'original_currency') {
    Write-Host "X drawings page missing currency-account matching" -ForegroundColor Red; exit 1
}
$bank = Get-Content -LiteralPath "app/banking/page.tsx" -Raw
if ($bank -notmatch 'v3.74.517') {
    Write-Host "X banking transfer missing source-currency guard" -ForegroundColor Red; exit 1
}
$pret = Get-Content -LiteralPath "app/purchase-returns/new/page.tsx" -Raw
if ($pret -notmatch 'original_currency') {
    Write-Host "X purchase-return refund account missing currency awareness" -ForegroundColor Red; exit 1
}
Write-Host "+ currency-account matching generalized: expenses, drawings, banking transfers, return refunds" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_517.txt"
    $msgLines = @(
        'feat(fx): v3.74.517 - currency-account matching on every money form',
        '',
        'Owner follow-up to v3.74.516: apply the same matching rule to the',
        'remaining money-in/out surfaces.',
        '',
        '- expenses/new: payment account list filtered by expense currency,',
        '  bidirectional sync (account <-> currency), exception link, and',
        '  an explicit confirm at save when mismatched. Account query now',
        '  selects original_currency.',
        '- drawings/new: same full pattern.',
        '- banking transfers: picking a source account already switched the',
        '  currency (v3.74.414); now changing the CURRENCY clears a',
        '  mismatched source account, and submit shows an explicit confirm',
        '  when the transfer currency differs from the source account',
        '  currency (with the converted equivalent).',
        '- purchase-returns/new refund account: matching-currency accounts',
        '  sort first with currency suffixes, and a mismatch warning shows',
        '  under the picker.',
        '',
        'Files',
        '  app/expenses/new/page.tsx',
        '  app/drawings/new/page.tsx',
        '  app/banking/page.tsx',
        '  app/purchase-returns/new/page.tsx',
        '  lib/version.ts -> 3.74.517'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.517 pushed - money forms are currency-coherent" -ForegroundColor Green
}
