$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.273.ps1") { Remove-Item -LiteralPath "push_v3.74.273.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.274"') {
    Write-Host "+ 3.74.274" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$rt = Get-Content -LiteralPath "components/manufacturing/routing/routing-list-page.tsx" -Raw
foreach ($c in @(
    'nextAutoRoutingCode',
    'handleOpenCreate',
    'إعدادات متقدمة',
    'اختر قائمة المكوّنات',
    'محتاجين تحدد المنتج',
    'بيتعبّأ من اسم قائمة المكوّنات تلقائياً'
)) {
    if ($rt -notmatch [regex]::Escape($c)) { Write-Host "X routing-list missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ routing-list form: only BOM picker visible; everything else collapsed; auto code+name+product" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_274.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.274 - Phase 2c - simplified Routing form',
        '',
        'Mirrors v3.74.267 (BOM form) for the Routing creation dialog.',
        'Before: the New Routing dialog asked for 8 fields up front',
        '(Branch, BOM, Product, Code, Name, Usage, Active toggle,',
        'Description). For a factory owner, almost all of these have',
        'a sensible default once the BOM is picked.',
        '',
        'After: only ONE field is visible by default.',
        '  - اختر قائمة المكوّنات (BOM picker) - required.',
        '    Picking a BOM auto-fills the product AND the routing name',
        '    ("مسار — <bom name>"). The user can then save with one click.',
        '',
        'Everything else is hidden under "إعدادات متقدمة":',
        '  - Branch, Product (read-only when a BOM is picked), Code,',
        '    Name, Usage Type, Active toggle, Description.',
        '',
        'Auto-fill so the user never has to think about codes:',
        '  - nextAutoRoutingCode() returns the next free ROUT-NNN by',
        '    scanning the existing list.',
        '  - handleOpenCreate() pre-fills the code before the dialog opens.',
        '  - handleCreate() falls back to auto code + auto name if the',
        '    user left them blank. Only product_id is strictly required',
        '    (and it is auto-filled by the BOM selector).',
        '',
        'API and validation untouched - same createRouting payload, same',
        'duplicate-detection. Existing routings render exactly the same.',
        '',
        'Files',
        '  components/manufacturing/routing/routing-list-page.tsx',
        '  lib/version.ts -> 3.74.274'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.274 pushed" -ForegroundColor Green
}
