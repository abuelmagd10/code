$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.663.ps1") { Remove-Item -LiteralPath "push_v3.74.663.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.664"') {
    Write-Host "+ 3.74.664" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.664]")) { Write-Host "X CHANGELOG missing [3.74.664]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# This release is pure application-layer logic (no DB DDL). Guard that the new
# detection helper exists so we never ship a half-wired build.
if (-not (Test-Path "lib/services/warehouse-manager-presence.ts")) {
    Write-Host "X warehouse-manager-presence.ts missing" -ForegroundColor Red; exit 1
}

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

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
    "lib/services/warehouse-manager-presence.ts" `
    "lib/services/sales-invoice-posting-command.service.ts" `
    "lib/services/sales-invoice-warehouse-command.service.ts" `
    "lib/services/bill-receipt-workflow.service.ts" `
    "push_v3.74.664.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.663.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_664.txt"
    $msgLines = @(
        'feat(warehouse): v3.74.664 - auto-approve stock movements when branch has no warehouse manager',
        '',
        '- Central branchHasWarehouseManager() (company_members store_manager/',
        '  warehouse_manager scoped to the branch).',
        '- Sales issue: on posting, if the branch has no warehouse manager and',
        '  goods remain pending, run the full delivery posting (FIFO + COGS +',
        '  stock-out) automatically via approveDelivery(auto). Fails safe: on a',
        '  shortage the invoice posting still succeeds; dispatch stays pending',
        '  and management is alerted.',
        '- Purchase receipt: on submit-for-receipt, if the branch has no',
        '  warehouse manager, run the full receipt posting (stock-in + Dr',
        '  Inventory / Cr AP) via postBillAtomic. Idempotent + fail-safe.',
        '- Applies to whoever executes the document, not only the owner. No DB',
        '  change; logic lives in the application layer.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.664 pushed - auto-approve stock movements when no warehouse manager" -ForegroundColor Green
}
