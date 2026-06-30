$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.415.ps1") { Remove-Item -LiteralPath "push_v3.74.415.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.416"') {
    Write-Host "+ 3.74.416" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/shareholders/page.tsx" -Raw
foreach ($n in @('v3.74.416', 'auto-switch', 'sortedAccounts', 'nativeCurrency')) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X shareholders page missing: $n" -ForegroundColor Red; exit 1
    }
}
# the old "filteredAccounts" wall should be gone
if ($page -match 'const filteredAccounts = cashBankAccounts\.filter') {
    Write-Host "X shareholders page still has hard currency filter" -ForegroundColor Red; exit 1
}
Write-Host "+ contribution dialog picks any account and currency follows" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_416.txt"
    $msgLines = @(
        'feat(shareholders): v3.74.416 - account pick auto-switches the currency',
        '',
        'Mirror of v3.74.414 for the capital-contribution dialog. Owner',
        'asked the contribution form to behave like the bank-transfer',
        'form: pick an account and let the currency follow, instead of',
        'forcing the user to first switch the currency and only then',
        'see the matching accounts.',
        '',
        'Changes',
        '  app/shareholders/page.tsx',
        '    - Account dropdown no longer hides accounts of a different',
        '      currency. Every cash/bank account is visible with its',
        '      currency tag, e.g. "1010 - بنك قناة السويس (USD)".',
        '    - Accounts whose currency matches the currently-selected',
        '      currency sort to the top so the most likely pick is one',
        '      click away.',
        '    - onValueChange now reads picked.currency and updates the',
        '      form currency in the same setState call when they differ.',
        '    - Helper text updated: "اختر أى حساب - العملة فوق هتتغير',
        '      تلقائياً للعملة الحساب."',
        '',
        'No DB / API changes.',
        '',
        'Files',
        '  app/shareholders/page.tsx',
        '  lib/version.ts -> 3.74.416'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.416 pushed - contribution form auto-syncs currency to the chosen account" -ForegroundColor Green
}
