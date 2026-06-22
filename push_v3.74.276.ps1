$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.275.ps1") { Remove-Item -LiteralPath "push_v3.74.275.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.276"') {
    Write-Host "+ 3.74.276" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$po = Get-Content -LiteralPath "components/manufacturing/production-order/production-order-list-page.tsx" -Raw
foreach ($c in @(
    'v3.74.276 — الفورم المبسّط',
    'v3.74.276 — selectors المخفية',
    'بنحضّر قائمة المكوّنات والمسار تلقائياً',
    'محتاج اختيار يدوى',
    'تم الاختيار تلقائياً'
)) {
    if ($po -notmatch [regex]::Escape($c)) { Write-Host "X production-order-list missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ production-order form: 3 visible fields; BOM/Routing details auto-pick or expand on demand" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_276.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.276 - Phase 2d - simplified Production Order form',
        '',
        'The New Production Order dialog used to slap 7 numbered fields on',
        'the user up front (Branch, Product, BOM, BOM Version, Routing,',
        'Routing Version, Quantity). For a factory owner who just wants to',
        'kick off a daily run, that is six selectors more than they need.',
        '',
        'After: only three fields are visible by default.',
        '  - المنتج المراد تصنيعه (Product, required)',
        '  - الكمية (Quantity, required)',
        '  - الفرع (Branch, defaults to current)',
        '',
        'The existing Auto-cascade Phase 3 logic does the rest: pick a',
        'product and the form auto-fills BOM + BOM version + Routing +',
        'Routing version when there is only one valid choice, and also',
        'inherits the BOMs issue warehouse.',
        '',
        'A new collapsible "قائمة المكوّنات والمسار" section appears',
        'after a product is picked. It is auto-open ONLY when the cascade',
        'could not pick everything by itself (multiple BOMs, etc.) so the',
        'user is steered to fill in the rest. When everything was auto',
        'picked, it stays collapsed with a green badge that reads "تم',
        'الاختيار تلقائياً". Inside it the four selectors still live.',
        '',
        'Advanced settings (warehouses, dates, notes) are unchanged - same',
        'collapsible block as before.',
        '',
        'API and payload are identical (ProductionOrderCreatePayload),',
        'all existing handlers, validation, and the duplicate-detection',
        'are reused as-is. Pure UI layout change.',
        '',
        'Files',
        '  components/manufacturing/production-order/production-order-list-page.tsx',
        '  lib/version.ts -> 3.74.276'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.276 pushed" -ForegroundColor Green
}
