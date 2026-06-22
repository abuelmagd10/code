$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.281.ps1") { Remove-Item -LiteralPath "push_v3.74.281.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.283"') {
    Write-Host "+ 3.74.283" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$d = Get-Content -LiteralPath "components/manufacturing/bom/bom-detail-page.tsx" -Raw
foreach ($c in @(
    'إيه يعنى "إصدار" قائمة المكوّنات؟',
    'الخامات المُكوّنة للمنتج',
    'إنشاء إصدار جديد',
    'إضافة خامة',
    'الإصدار ده لسه فاضى',
    'القائمة دى مش موجودة'
)) {
    if ($d -notmatch [regex]::Escape($c)) { Write-Host "X bom-detail missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bom-detail page: friendlier Arabic + version-workflow banner" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_283.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.283 - BOM detail page in plain Arabic',
        '',
        'The BOM detail page used to read like an enterprise spec sheet:',
        '"إدارة بيانات هيكل المواد، نسخه، ومكوناته. جميع عمليات الاعتماد',
        'والتفعيل مؤمّنة ومسجّلة." A factory owner would not know what',
        '"هيكل" means or why "نسخ" exist.',
        '',
        'Changes (all text, no logic changes)',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '',
        '  - Header rewritten:',
        '      "جارٍ تحميل قائمة المكوّنات..." / "القائمة مش متاحة"',
        '      "إدارة قائمة المكوّنات وإصداراتها."',
        '      "رجوع لقوائم المكوّنات"',
        '',
        '  - New blue banner under the header explains the version',
        '    workflow in plain Arabic:',
        '      "إيه يعنى إصدار قائمة المكوّنات؟ كل قائمة لها إصدار واحد',
        '      معتمد. الإصدار بيحدد الخامات وكمياتها وقت إنتاج المنتج.',
        '      لما تحب تغيّر الوصفة، تنشئ إصدار جديد..."',
        '',
        '  - Inner labels:',
        '      "المواد الخام"        -> "الخامات المُكوّنة للمنتج"',
        '      "إضافة مكوّن"          -> "إضافة خامة"',
        '      "حفظ المواد"           -> "حفظ الخامات"',
        '      "إنشاء نسخة"           -> "إنشاء إصدار جديد"',
        '      "إنشاء النسخة الأولى"  -> "إنشاء الإصدار الأول"',
        '      "اعتماد النسخة"        -> "اعتماد الإصدار"',
        '',
        '  - Empty-state copy moved from formal to conversational:',
        '      "لا توجد نسخة بعد"     -> "مفيش إصدار لسه"',
        '      "لا توجد مكونات بعد"   -> "الإصدار ده لسه فاضى"',
        '      "تعذر الوصول لهذا السجل" -> "القائمة دى مش موجودة"',
        '',
        'Files',
        '  components/manufacturing/bom/bom-detail-page.tsx',
        '  lib/version.ts -> 3.74.283'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.283 pushed" -ForegroundColor Green
}
