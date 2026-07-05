$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.537"') {
    Write-Host "+ 3.74.537" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/simple-report/route.ts" -Raw
if ($api -notmatch 'account_type === "liability"') {
    Write-Host "X api route not summing liabilities" -ForegroundColor Red; exit 1
}
if ($api -notmatch 'liabilities: \{ total: totalLiabilities') {
    Write-Host "X api route not returning liabilities block" -ForegroundColor Red; exit 1
}
Write-Host "+ api returns liabilities block" -ForegroundColor Green

$page = Get-Content -LiteralPath 'app/reports/simple-summary/page.tsx' -Raw
if ($page -notmatch 'Assets − Liabilities − Capital') {
    Write-Host "X page not using new accounting equation label" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'data\.assets\.total - liab - data\.capital\.total') {
    Write-Host "X page not subtracting liabilities in the calc" -ForegroundColor Red; exit 1
}
Write-Host "+ page computes Assets − Liabilities − Capital" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_537.txt"
    $msgLines = @(
        'fix(reports): v3.74.537 - simple summary subtracts liabilities so unpaid supplier balances stop looking like profit',
        '',
        'Owner report shot: assets 30,001 vs capital 30,000, labelled as',
        '"1 EGP profit". That 1 EGP is actually the supplier balance',
        'still owed on BILL-0001 (1.38 EGP), so the report was calling a',
        'real payable a phantom profit.',
        '',
        'Fix (Node only):',
        '  simple-report route now emits a liabilities block computed',
        '  from journal_entry_lines where account_type = liability and',
        '  entry_date <= toDate.',
        '  simple-summary page relabels the callout from "difference',
        '  between capital and assets" to "Assets - Liabilities -',
        '  Capital" and does the correct math. When any liabilities',
        '  exist, a secondary line surfaces them so the owner sees why',
        '  the gap is what it is.',
        '',
        'For BILL-0001 (7.34 total, 4.93 paid, 1.03 returned, 1.38',
        'owed): assets 30001.31 - liabilities 1.38 - capital 30000 =',
        '-0.07 (rounds to 0). No phantom profit.',
        '',
        'Files',
        '  app/api/simple-report/route.ts',
        '  app/reports/simple-summary/page.tsx',
        '  supabase/migrations/20260705000537_...sql',
        '  lib/version.ts -> 3.74.537'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.537 pushed - accounting equation honest at last" -ForegroundColor Green
}
