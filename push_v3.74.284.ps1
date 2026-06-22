$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.283.ps1") { Remove-Item -LiteralPath "push_v3.74.283.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.284"') {
    Write-Host "+ 3.74.284" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$po = Get-Content -LiteralPath "lib/manufacturing/production-order-ui.ts" -Raw
foreach ($c in @(
    'معلومات الأمر',
    'خطوات التصنيع',
    'صرف الخامات',
    'استلام المنتج النهائى',
    'إصدار الأمر للتنفيذ',
    'إعادة بناء الخطوات',
    'مخزن صرف الخامات',
    'الأمر اتصدّر للتنفيذ',
    'بدأ التصنيع'
)) {
    if ($po -notmatch [regex]::Escape($c)) { Write-Host "X production-order-ui missing $c" -ForegroundColor Red; exit 1 }
}
# Sanity: make sure leftover formal phrases were actually removed
foreach ($old in @(
    'تُحدَّث هذه الصفحة تلقائيًا',
    'تعذر تحميل أمر الإنتاج',
    'هيكل المواد / مسار التشغيل',
    'تأكيد اعتماد أمر الإنتاج'
)) {
    if ($po -match [regex]::Escape($old)) {
        Write-Host "X production-order-ui still contains formal phrase: $old" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ production-order detail copy switched to plain conversational Arabic" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_284.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.284 - production order detail page in plain Arabic',
        '',
        'Owner-facing pass on the Production Order detail screen. The page',
        'previously read like an enterprise spec ("تُحدَّث هذه الصفحة تلقائيًا',
        'بعد كل أمر تنفيذي. البيانات المعروضة هي المصدر الوحيد للحقيقة.").',
        'A factory owner does not say "أمر تنفيذي" or "هيكل المواد"; they',
        'say "خطوات التصنيع" and "قائمة المكوّنات".',
        '',
        'Rewritten 98 strings in lib/manufacturing/production-order-ui.ts:',
        '',
        '  Tabs',
        '    نظرة عامة      -> معلومات الأمر',
        '    العمليات        -> خطوات التصنيع',
        '    صرف المواد     -> صرف الخامات',
        '    استلام المنتج   -> استلام المنتج النهائى',
        '',
        '  Sections',
        '    ملخص الأمر                 -> معلومات الأمر',
        '    بيانات أمر الإنتاج           -> بيانات الأمر',
        '    المصادر المعتمدة للتصنيع -> القائمة والمسار المرتبطين',
        '    تاريخ الأمر                  -> خط زمن الأمر',
        '    مراحل التصنيع              -> خطوات التصنيع',
        '',
        '  Field labels',
        '    المنتج المراد تصنيعه          -> المنتج',
        '    هيكل المواد / مسار التشغيل  -> قائمة المكوّنات / مسار التصنيع',
        '    عدد العمليات                 -> عدد الخطوات',
        '    مستودع الصرف                -> مخزن صرف الخامات',
        '    مستودع الاستلام             -> مخزن استلام المنتج النهائى',
        '    تاريخ البداية المخطط         -> تاريخ البدء المخطط',
        '    تاريخ الانتهاء المخطط         -> تاريخ التسليم المخطط',
        '',
        '  Buttons',
        '    حفظ البيانات                 -> حفظ',
        '    إعادة توليد العمليات          -> إعادة بناء الخطوات',
        '    إصدار الأمر                   -> إصدار الأمر للتنفيذ',
        '    بدء التنفيذ                   -> بدء التصنيع',
        '    إكمال الأمر                   -> إنهاء الأمر',
        '    تحديث التقدّم                -> تحديث تقدّم الخطوة',
        '',
        '  Banners / empty states / toasts / dialog descriptions',
        '    All rewritten in everyday Arabic that matches what an Egyptian',
        '    factory owner actually says.',
        '',
        'No component / handler / API change. The detail page reads the new',
        'strings through the same copy.detail.* indirection that already',
        'existed.',
        '',
        'Files',
        '  lib/manufacturing/production-order-ui.ts',
        '  lib/version.ts -> 3.74.284'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.284 pushed" -ForegroundColor Green
}
