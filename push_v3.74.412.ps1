$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.411.ps1") { Remove-Item -LiteralPath "push_v3.74.411.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.412"') {
    Write-Host "+ 3.74.412" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/shareholders/page.tsx" -Raw
foreach ($n in @(
    'v3.74.412',
    'contribution_currency',
    'filteredAccounts',
    'original_currency',
    'لا توجد حسابات بعملة'
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X shareholders page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ currency filter wired in contribution dialog" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_412.txt"
    $msgLines = @(
        'feat(shareholders): v3.74.412 - filter payment accounts by currency',
        '',
        'Owner asked: when a shareholder contributes in a non-base',
        'currency (e.g. USD), the payment-account dropdown should',
        'show only USD accounts. Currently it shows every cash + bank',
        'account regardless of currency, which produces a JE in the',
        'wrong currency.',
        '',
        'Changes',
        '  Capital-contribution dialog (/shareholders):',
        '    + Currency selector (defaults to EGP). Available list is',
        '      computed from the union of currencies on existing cash',
        '      / bank accounts so we never show a currency the user',
        '      cannot actually post into.',
        '    + Payment-account dropdown now filters by the selected',
        '      currency. Each option shows the account currency next',
        '      to its name, e.g. "1010 - بنك قناة السويس (USD)".',
        '    + If no account exists in the chosen currency, we show a',
        '      hint to add one in Chart of Accounts.',
        '',
        '  loadCashBankAccounts now selects original_currency and',
        '  normalises it onto AccountOption.currency.',
        '',
        'No DB changes. No baseline changes (this is a UX-only fix).',
        '',
        'Files',
        '  app/shareholders/page.tsx',
        '  lib/version.ts -> 3.74.412'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.412 pushed - payment accounts filtered by currency" -ForegroundColor Green
}
