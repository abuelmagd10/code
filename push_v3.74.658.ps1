$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.657.ps1") { Remove-Item -LiteralPath "push_v3.74.657.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.658"') {
    Write-Host "+ 3.74.658" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.658]")) { Write-Host "X CHANGELOG missing [3.74.658]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$rm = Get-Content -LiteralPath "components/customers/README.md" -Raw
if ($rm -notmatch "onSaveComplete" -or $rm -notmatch "renders its OWN trigger button") { Write-Host "X README not corrected" -ForegroundColor Red; exit 1 }
if ($rm -match "onSave``: Callback") { Write-Host "X stale README prop still present" -ForegroundColor Red; exit 1 }
Write-Host "+ CustomerFormDialog README corrected (real props + default-trigger warning)" -ForegroundColor Green

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
    "components/customers/README.md" `
    "push_v3.74.658.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.657.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_658.txt"
    $msgLines = @(
        'docs(customers): v3.74.658 - fix misleading CustomerFormDialog README',
        '',
        '- Corrected props to match the component (open, onOpenChange,',
        '  editingCustomer?, onSaveComplete, trigger?); the old doc listed',
        '  customer/onSave/accounts which do not exist.',
        '- Added a prominent warning that the dialog renders its own default',
        '  trigger button; pass your own via `trigger` instead of adding a',
        '  second button (the source of the v3.74.656 duplicate-button bug).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.658 pushed - CustomerFormDialog docs corrected" -ForegroundColor Green
}
