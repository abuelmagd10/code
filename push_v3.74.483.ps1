$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.482.ps1") { Remove-Item -LiteralPath "push_v3.74.482.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.483"') {
    Write-Host "+ 3.74.483" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000483_v3_74_483_goods_receipt_items.sql")) {
    Write-Host "X migration 483 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'receiptExpandedId' -or $page -notmatch 'عرض بنود الفاتورة') {
    Write-Host "X approvals page missing expandable items panel" -ForegroundColor Red; exit 1
}
Write-Host "+ goods receipt cards include expandable items table" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_483.txt"
    $msgLines = @(
        'feat(inbox): v3.74.483 - goods receipt cards show bill line items',
        '',
        'Owner tested v3.74.478 dispatch/receipt flow and pointed out that',
        'the dedicated /inventory/goods-receipt page renders a product',
        'table before the confirm button, while the inbox card showed only',
        'the total. Warehouse manager had to leave the inbox to see the',
        'bill contents.',
        '',
        'Loader now also fetches bill_items joined on products.',
        'Card has a "View items (N)" toggle that expands into a small',
        'table with product name (+ Service badge when applicable),',
        'quantity, unit price, and line total.',
        '',
        'No DB or API changes.',
        '',
        'Files',
        '   supabase/migrations/20260701000483_v3_74_483_goods_receipt_items.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section CD added)',
        '   lib/version.ts -> 3.74.483'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.483 pushed - goods receipt cards show items" -ForegroundColor Green
}
