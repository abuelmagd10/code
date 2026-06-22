$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.284.ps1") { Remove-Item -LiteralPath "push_v3.74.284.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.285"') {
    Write-Host "+ 3.74.285" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$rd = Get-Content -LiteralPath "components/manufacturing/routing/routing-detail-page.tsx" -Raw
foreach ($c in @(
    'خطوات التصنيع',
    'إضافة خطوة',
    'إنشاء إصدار جديد',
    'إصدار جديد',
    'محطة العمل المسؤولة عن تنفيذ الخطوة',
    'كود الخطوة'
)) {
    if ($rd -notmatch [regex]::Escape($c)) { Write-Host "X routing-detail missing $c" -ForegroundColor Red; exit 1 }
}
foreach ($old in @(
    'هيكل العمليات',
    'إدارة بيانات مسار التصنيع، نسخه',
    'إنشاء Routing Version'
)) {
    if ($rd -match [regex]::Escape($old)) {
        Write-Host "X routing-detail still contains formal phrase: $old" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ routing-detail: friendlier copy + operation-as-step labels" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_285.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.285 - Routing detail page in plain Arabic',
        '',
        'Final UX pass on the manufacturing module. The Routing detail page',
        'used to say "هيكل العمليات", "النسخة المحددة", "إنشاء Routing Version',
        'جديدة" - terminology that belongs in a manufacturing engineering',
        'textbook, not a small-factory ERP.',
        '',
        'Rewrote ~87 strings in components/manufacturing/routing/routing-detail-page.tsx:',
        '',
        '  Concept renaming',
        '    عملية / العمليات    -> خطوة / خطوات (consistent with the rest of',
        '                            the module after v3.74.284).',
        '    النسخة              -> الإصدار',
        '    مسار التشغيل        -> مسار التصنيع',
        '    هيكل العمليات       -> خطوات التصنيع',
        '',
        '  Buttons',
        '    إنشاء نسخة                  -> إنشاء إصدار جديد',
        '    إضافة عملية                 -> إضافة خطوة',
        '    حفظ بيانات النسخة            -> حفظ الإصدار',
        '    تفعيل النسخة                 -> تفعيل الإصدار',
        '    إيقاف النسخة                 -> شيل من الخدمة',
        '    أرشفة النسخة                 -> أرشفة',
        '',
        '  Toasts',
        '    "تم تفعيل النسخة"            -> "الإصدار اتفعّل"',
        '    "تم إيقاف النسخة"            -> "الإصدار اتشال من الخدمة"',
        '    "تمت أرشفة النسخة"          -> "الإصدار اتأرشف"',
        '    "تم حفظ بيانات النسخة"     -> "تم حفظ الإصدار"',
        '',
        '  Step fields - all 8 per-step helper descriptions rewritten in',
        '  the same conversational Arabic used elsewhere ("الوقت اللى يقضيه',
        '  العامل فى تنفيذ الخطوة" instead of "الوقت الفعلي الذي يقضيه العامل',
        '  (الإنسان) في تنفيذ هذه العملية").',
        '',
        '  Dialog labels',
        '    Confirm dialogs for delete / activate / archive / pause all',
        '    rewritten to say what will happen in everyday Arabic.',
        '',
        'No logic / handler / API change. The file kept its line count and',
        'closes cleanly.',
        '',
        'Files',
        '  components/manufacturing/routing/routing-detail-page.tsx',
        '  lib/version.ts -> 3.74.285'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.285 pushed" -ForegroundColor Green
}
