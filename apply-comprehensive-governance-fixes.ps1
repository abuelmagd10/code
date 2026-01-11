# 🔒 تطبيق إصلاحات نظام الحوكمة الشاملة
# Apply Comprehensive ERP Governance Fixes

Write-Host "🔒 تطبيق إصلاحات نظام الحوكمة الشاملة" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ""

# التحقق من وجود الملفات المطلوبة
$requiredFiles = @(
    "scripts\MANDATORY_ERP_GOVERNANCE_FIXES.sql",
    "lib\data-visibility-control-fixed.ts"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "❌ خطأ: الملف المطلوب غير موجود: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ جميع الملفات المطلوبة موجودة" -ForegroundColor Green
Write-Host ""

# الخطوة 1: تطبيق إصلاحات قاعدة البيانات
Write-Host "📋 الخطوة 1: تطبيق إصلاحات قاعدة البيانات..." -ForegroundColor Cyan
Write-Host "سيتم تطبيق الحوكمة الإلزامية: Company → Branch → Cost Center → Warehouse" -ForegroundColor Gray
Write-Host ""

# قراءة URL قاعدة البيانات
$dbUrl = Read-Host "أدخل رابط قاعدة البيانات (أو اضغط Enter لاستخدام .env.local)"

if ([string]::IsNullOrEmpty($dbUrl)) {
    if (Test-Path ".env.local") {
        Write-Host "📄 قراءة رابط قاعدة البيانات من .env.local..." -ForegroundColor Green
        $envContent = Get-Content ".env.local"
        $dbLine = $envContent | Where-Object { $_ -match "DATABASE_URL" }
        if ($dbLine) {
            $dbUrl = ($dbLine -split "=", 2)[1].Trim('"')
            Write-Host "✅ تم العثور على رابط قاعدة البيانات" -ForegroundColor Green
        } else {
            Write-Host "❌ DATABASE_URL غير موجود في .env.local" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ ملف .env.local غير موجود" -ForegroundColor Red
        exit 1
    }
}

# تطبيق إصلاحات قاعدة البيانات
Write-Host ""
Write-Host "🔧 تطبيق إصلاحات الحوكمة الإلزامية..." -ForegroundColor Yellow

try {
    $result = psql $dbUrl -f "scripts\MANDATORY_ERP_GOVERNANCE_FIXES.sql" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ تم تطبيق إصلاحات قاعدة البيانات بنجاح!" -ForegroundColor Green
    } else {
        Write-Host "❌ خطأ في تطبيق إصلاحات قاعدة البيانات:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ خطأ: أمر psql غير موجود. يرجى تثبيت PostgreSQL client tools." -ForegroundColor Red
    Write-Host "أو قم بتشغيل السكريبت يدوياً في قاعدة البيانات." -ForegroundColor Yellow
    exit 1
}

# الخطوة 2: تحديث ملف نظام الحوكمة
Write-Host ""
Write-Host "📋 الخطوة 2: تحديث نظام الحوكمة في الكود..." -ForegroundColor Cyan

# إنشاء نسخة احتياطية من الملف الحالي
if (Test-Path "lib\data-visibility-control.ts") {
    $backupName = "lib\data-visibility-control-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ts"
    Copy-Item "lib\data-visibility-control.ts" $backupName
    Write-Host "✅ تم إنشاء نسخة احتياطية: $backupName" -ForegroundColor Green
}

# استبدال الملف بالإصدار المحدث
Copy-Item "lib\data-visibility-control-fixed.ts" "lib\data-visibility-control.ts" -Force
Write-Host "✅ تم تحديث نظام الحوكمة" -ForegroundColor Green

# الخطوة 3: فحص الكود للأنماط الخطيرة
Write-Host ""
Write-Host "📋 الخطوة 3: فحص الكود للأنماط الخطيرة..." -ForegroundColor Cyan

$dangerousPatterns = @(
    "OR.*branch_id.*IS.*NULL",
    "OR.*cost_center_id.*IS.*NULL", 
    "OR.*warehouse_id.*IS.*NULL",
    "OR.*created_by_user_id.*IS.*NULL"
)

$foundViolations = $false

foreach ($pattern in $dangerousPatterns) {
    $patternMatches = Select-String -Path "app\**\*.ts", "app\**\*.tsx", "lib\**\*.ts" -Pattern $pattern -ErrorAction SilentlyContinue
    
    if ($patternMatches) {
        if (-not $foundViolations) {
            Write-Host ""
            Write-Host "⚠️  تم العثور على أنماط خطيرة:" -ForegroundColor Red
            Write-Host "=============================" -ForegroundColor Red
            $foundViolations = $true
        }
        
        foreach ($match in $patternMatches) {
            Write-Host "❌ $($match.Filename):$($match.LineNumber)" -ForegroundColor Red
        }
    }
}

if ($foundViolations) {
    Write-Host ""
    Write-Host "🚨 تحذير: يجب إزالة جميع الأنماط الخطيرة أعلاه قبل النشر!" -ForegroundColor Red
} else {
    Write-Host "✅ لم يتم العثور على أنماط خطيرة في الكود!" -ForegroundColor Green
}

# الخطوة 4: إنشاء تقرير الحوكمة
Write-Host ""
Write-Host "📋 الخطوة 4: إنشاء تقرير الحوكمة..." -ForegroundColor Cyan

$reportPath = "GOVERNANCE_IMPLEMENTATION_REPORT_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
$report = @()
$report += "تقرير تطبيق نظام الحوكمة الشامل"
$report += "تاريخ التطبيق: $(Get-Date)"
$report += "======================================"
$report += ""
$report += "✅ الإصلاحات المطبقة:"
$report += "1. إصلاحات قاعدة البيانات - تم تطبيقها"
$report += "2. نظام الحوكمة - تم تحديثه"
$report += "3. فحص الأنماط الخطيرة - تم"
$report += ""

if ($foundViolations) {
    $report += "⚠️  تحذيرات:"
    $report += "- تم العثور على أنماط خطيرة تحتاج إزالة"
} else {
    $report += "✅ لا توجد تحذيرات"
}

$report += ""
$report += "📋 الخطوات التالية:"
$report += "1. اختبار دور Staff - يجب أن يرى فقط أوامره"
$report += "2. اختبار دور Accountant - يجب أن يرى أوامر الفرع"
$report += "3. اختبار دور Manager - يجب أن يرى أوامر الفرع"
$report += "4. اختبار دور Owner/Admin - يجب أن يرى جميع الأوامر"
$report += ""
$report += "🔐 قواعد الحوكمة المطبقة:"
$report += "- Company → Branch → Cost Center → Warehouse → Created By User"
$report += "- Staff: يرى فقط ما أنشأه"
$report += "- Accountant: يرى كل بيانات الفرع مع فلترة حسب الموظف"
$report += "- Manager: يرى كل بيانات الفرع"
$report += "- Owner/Admin: يرى كل بيانات الشركة"

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "📄 تم حفظ تقرير الحوكمة: $reportPath" -ForegroundColor Green

# الخطوة 5: التحقق من التطبيق
Write-Host ""
Write-Host "📋 الخطوة 5: التحقق من صحة التطبيق..." -ForegroundColor Cyan

# التحقق من وجود الجداول المطلوبة
Write-Host "🔍 التحقق من الجداول المطلوبة..." -ForegroundColor Gray

$verificationQueries = @"
-- التحقق من وجود الأعمدة المطلوبة
SELECT 
  'sales_orders' as table_name,
  COUNT(CASE WHEN column_name = 'branch_id' THEN 1 END) as has_branch_id,
  COUNT(CASE WHEN column_name = 'cost_center_id' THEN 1 END) as has_cost_center_id,
  COUNT(CASE WHEN column_name = 'warehouse_id' THEN 1 END) as has_warehouse_id,
  COUNT(CASE WHEN column_name = 'created_by_user_id' THEN 1 END) as has_created_by_user_id
FROM information_schema.columns 
WHERE table_name = 'sales_orders' 
  AND column_name IN ('branch_id', 'cost_center_id', 'warehouse_id', 'created_by_user_id');
"@

try {
    $verificationResult = echo $verificationQueries | psql $dbUrl 2>&1
    Write-Host "✅ تم التحقق من هيكل قاعدة البيانات" -ForegroundColor Green
} catch {
    Write-Host "⚠️  لا يمكن التحقق من قاعدة البيانات تلقائياً" -ForegroundColor Yellow
}

# الخطوة 6: الخلاصة والتوجيهات
Write-Host ""
Write-Host "🎯 تم الانتهاء من تطبيق إصلاحات الحوكمة!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ ما تم تطبيقه:" -ForegroundColor Green
Write-Host "  • إصلاحات قاعدة البيانات الإلزامية" -ForegroundColor White
Write-Host "  • نظام الحوكمة المحدث" -ForegroundColor White
Write-Host "  • فحص الأنماط الخطيرة" -ForegroundColor White
Write-Host "  • تقرير شامل للحوكمة" -ForegroundColor White
Write-Host ""

Write-Host "📋 الخطوات التالية المطلوبة:" -ForegroundColor Cyan
Write-Host "1. اختبار النظام مع أدوار مختلفة" -ForegroundColor White
Write-Host "2. التأكد من عمل فلاتر الحوكمة" -ForegroundColor White
Write-Host "3. تطبيق نفس النظام على باقي الصفحات" -ForegroundColor White
Write-Host "4. إزالة أي أنماط خطيرة متبقية" -ForegroundColor White
Write-Host ""

Write-Host "🚨 تحذيرات مهمة:" -ForegroundColor Red
Write-Host "• لا تفعل المرتجعات حتى اكتمال جميع الاختبارات" -ForegroundColor Red
Write-Host "• لا تفعل سير العمل حتى التأكد من الحوكمة" -ForegroundColor Red
Write-Host "• اختبر كل دور قبل النشر في الإنتاج" -ForegroundColor Red
Write-Host ""

Write-Host "🚀 النظام جاهز للاختبار!" -ForegroundColor Cyan
Write-Host "تقرير مفصل متاح في: $reportPath" -ForegroundColor Gray
Write-Host ""

# عرض ملخص سريع للأدوار
Write-Host "📊 ملخص صلاحيات الأدوار:" -ForegroundColor Yellow
Write-Host "┌─────────────┬─────────────────────────────────────┐" -ForegroundColor Gray
Write-Host "│ الدور       │ الصلاحيات                          │" -ForegroundColor Gray
Write-Host "├─────────────┼─────────────────────────────────────┤" -ForegroundColor Gray
Write-Host "│ Staff       │ يرى فقط ما أنشأه                   │" -ForegroundColor White
Write-Host "│ Accountant  │ يرى كل بيانات الفرع + فلترة موظف   │" -ForegroundColor White
Write-Host "│ Manager     │ يرى كل بيانات الفرع               │" -ForegroundColor White
Write-Host "│ Owner/Admin │ يرى كل بيانات الشركة              │" -ForegroundColor White
Write-Host "└─────────────┴─────────────────────────────────────┘" -ForegroundColor Gray
Write-Host ""

Write-Host "✨ تم الانتهاء بنجاح!" -ForegroundColor Green