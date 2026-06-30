$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.413.ps1") { Remove-Item -LiteralPath "push_v3.74.413.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.414"') {
    Write-Host "+ 3.74.414" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/banking/page.tsx" -Raw
foreach ($n in @('v3.74.414', 'nativeCurrency', 'picked?.original_currency', 'original_currency ? `')) {
    # Different regex matching approach for special chars
    if ($n -eq 'picked?.original_currency') {
        if ($page -notmatch 'picked\)\?.original_currency') {
            # Try another pattern that might be present
            if ($page -notmatch 'picked as any\)\?.original_currency') {
                Write-Host "X banking page missing: $n" -ForegroundColor Red; exit 1
            }
        }
        continue
    }
    if ($n -eq 'original_currency ? `') {
        if ($page -notmatch 'original_currency \? `') {
            Write-Host "X banking page missing currency tag" -ForegroundColor Red; exit 1
        }
        continue
    }
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X banking page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ from-account onChange auto-switches the transfer currency" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_414.txt"
    $msgLines = @(
        'feat(banking): v3.74.414 - auto-switch transfer currency to source account native',
        '',
        'Owner asked: in the bank-transfer form, when the user picks a',
        'source account whose currency differs from the app default,',
        'the transfer-currency field should switch automatically to',
        'match the source account. This stops the user from leaving',
        '"EGP" selected while transferring out of a USD account (which',
        'would then post the JE in the wrong currency or rely on',
        'silent FX assumptions).',
        '',
        'Changes',
        '  app/banking/page.tsx',
        '    + From-account onChange now reads picked.original_currency',
        '      and, when it differs from the current transfer.currency,',
        '      updates the transfer state with the native currency.',
        '    + Both From and To account dropdowns now show the account',
        '      currency in parentheses next to the name, e.g.',
        '      "1010 - بنك قناة السويس (USD)" — purely cosmetic but',
        '      removes guesswork.',
        '',
        'No DB change. No API change (existing /api/banking/transfers',
        'already carries currencyCode in the body and the service',
        'handles non-base transfers correctly).',
        '',
        'Files',
        '  app/banking/page.tsx',
        '  lib/version.ts -> 3.74.414'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.414 pushed - transfer currency now follows the source account" -ForegroundColor Green
}
