$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.514.ps1") { Remove-Item -LiteralPath "push_v3.74.514.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.515"') {
    Write-Host "+ 3.74.515" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$np = Get-Content -LiteralPath "app/purchase-returns/new/page.tsx" -Raw
if ($np -notmatch 'docDiscountRatio') {
    Write-Host "X return valuation missing document discount ratio" -ForegroundColor Red; exit 1
}
$ratioCount = ([regex]::Matches($np, 'docDiscountRatio')).Count
if ($ratioCount -lt 12) {
    Write-Host "X ratio not applied across all computation paths (found $ratioCount refs)" -ForegroundColor Red; exit 1
}
Write-Host "+ return valuation prorates the bill document discount ($ratioCount refs)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_515.txt"
    $msgLines = @(
        'fix(returns): v3.74.515 - return valuation includes document discount',
        '',
        'Case-1 verification on PRET-5689 surfaced a systematic valuation',
        'gap the owner chose to fix (option B): returns were valued at the',
        'line net (after ITEM discount) while ignoring the bill-level',
        'document discount. On a 15% doc-discount bill the return credited',
        'inventory and debited AP above the carried cost - small per',
        'return, systematic in aggregate.',
        '',
        'The new-return page now derives docDiscountRatio =',
        'bills.subtotal / SUM(bill_items.line_total) for the selected bill',
        'and applies it to: the single-path subtotal/tax memos, the',
        'multi-warehouse allocation totals + per-group amounts, every',
        'payload line_total (create / resubmit / vendor-credit items),',
        'and the original-currency effective totals. The edit-mode loader',
        'recomputes pre-ratio line values from qty x price x item-discount',
        'so the ratio is never double-applied. A hint line shows the',
        'applied document-discount share on both totals panels.',
        '',
        'Files',
        '  app/purchase-returns/new/page.tsx',
        '  lib/version.ts -> 3.74.515'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.515 pushed - returns valued at true carried cost" -ForegroundColor Green
}
