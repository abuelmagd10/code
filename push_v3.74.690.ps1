$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.689.ps1") { Remove-Item -LiteralPath "push_v3.74.689.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.690"') {
    Write-Host "+ 3.74.690" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.690]")) { Write-Host "X CHANGELOG missing [3.74.690]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Both realtime filters must now branch-scope.
$inv = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
$so  = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
if ($inv -notmatch "branch isolation for realtime" -or $so -notmatch "branch isolation for realtime") {
    Write-Host "X realtime branch guard missing in invoices/sales-orders" -ForegroundColor Red; exit 1
}
Write-Host "+ realtime branch guards present (invoices + sales-orders)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/invoices/page.tsx" `
    "app/sales-orders/page.tsx" `
    "push_v3.74.690.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.689.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_690.txt"
    $msgLines = @(
        'fix(security): v3.74.690 - close realtime cross-branch leak on invoices + sales-orders',
        '',
        '- Project-wide audit after the PO fix. Only two pages repeated the',
        '  realtime-inject leak: invoices and sales-orders filtered realtime',
        '  events by company_id only, injecting other branches new rows into a',
        '  branch-scoped user list. Added the same branch guard used on POs.',
        '- No other leaks: role classifiers are consistent; other realtime pages',
        '  refetch through a branch-filtered query or are warehouse/company-scoped.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.690 pushed - realtime branch isolation (invoices + sales-orders)" -ForegroundColor Green
}
