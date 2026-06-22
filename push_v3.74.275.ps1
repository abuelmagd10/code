$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.274.ps1") { Remove-Item -LiteralPath "push_v3.74.274.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.275"') {
    Write-Host "+ 3.74.275" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bom = Get-Content -LiteralPath "components/manufacturing/bom/bom-list-page.tsx" -Raw
foreach ($c in @(
    'v3.74.275 — الفرع ظاهر دلوقتى',
    'v3.74.275 — مخزن صرف الخامات ظاهر دلوقتى',
    'محتاجين تحدد الفرع',
    'محتاجين تختار مخزن صرف الخامات'
)) {
    if ($bom -notmatch [regex]::Escape($c)) { Write-Host "X bom-list missing $c" -ForegroundColor Red; exit 1 }
}
# Ensure the warehouse picker appears exactly once in the dialog body (no duplicate left in Advanced)
$pickerCount = ([regex]::Matches($bom, 'RawMaterialWarehousePicker')).Count
# 1 = import; 1 usage in the form. So count should be 2 inside the file.
if ($pickerCount -ne 2) {
    Write-Host "X expected RawMaterialWarehousePicker to appear twice (import + 1 usage), found $pickerCount" -ForegroundColor Red; exit 1
}
Write-Host "+ BOM form: branch + warehouse visible alongside product; single picker; unified toast wording" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_275.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.275 - BOM form keeps Branch + Issue Warehouse visible',
        '',
        'Owner feedback after v3.74.267-269: hiding the issue warehouse',
        'inside the Advanced accordion meant users could fail validation',
        'without realising why - they would never expand Advanced and',
        'the error toast just told them to "open Advanced settings".',
        '',
        'Promotion: Branch and Issue Warehouse are now visible in the',
        'main dialog body alongside Product, with a red asterisk each.',
        'They are no longer collapsed. The Advanced accordion still',
        'covers Code, Name, Usage Type, Active toggle, Description.',
        '',
        'Validation toasts now match the product-required wording exactly:',
        '  - "محتاجين تحدد المنتج" -> "اختر المنتج..." (existing)',
        '  - "محتاجين تحدد الفرع" -> "اختر الفرع..." (new)',
        '  - "محتاجين تختار مخزن صرف الخامات" -> "اختر المخزن..." (rewritten)',
        '  No more "open Advanced settings" instructions, because the',
        '  field is already in front of the user.',
        '',
        'Files',
        '  components/manufacturing/bom/bom-list-page.tsx',
        '  lib/version.ts -> 3.74.275'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.275 pushed" -ForegroundColor Green
}
