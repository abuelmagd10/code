# ============================================
# 🔍 سكريبت تشغيل استعلامات التدقيق
# ERB VitaSlims - Compliance Audit Runner
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🔍 بدء مراجعة الالتزام الشاملة" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# التحقق من وجود ملف الاستعلامات
$sqlFile = ".\sql\compliance-audit-queries.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ خطأ: ملف الاستعلامات غير موجود" -ForegroundColor Red
    Write-Host "المسار المتوقع: $sqlFile" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ تم العثور على ملف الاستعلامات" -ForegroundColor Green
Write-Host ""

# قراءة بيانات الاتصال من .env.local
Write-Host "📋 قراءة إعدادات قاعدة البيانات..." -ForegroundColor Yellow

$envFile = ".\.env.local"
if (Test-Path $envFile) {
    Write-Host "✅ تم العثور على ملف .env.local" -ForegroundColor Green
} else {
    Write-Host "⚠️  تحذير: ملف .env.local غير موجود" -ForegroundColor Yellow
    Write-Host "يرجى تشغيل الاستعلامات يدوياً في Supabase Dashboard" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "📊 الاستعلامات الحرجة (يجب أن ترجع 0 rows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# قائمة الاستعلامات الحرجة
$criticalChecks = @(
    @{
        Name = "1. أوامر بيع بدون حوكمة"
        Description = "التحقق من وجود أوامر بيع بدون company_id أو branch_id أو warehouse_id"
        Priority = "P0"
    },
    @{
        Name = "2. فواتير بدون حوكمة"
        Description = "التحقق من وجود فواتير بدون سياق حوكمة كامل"
        Priority = "P0"
    },
    @{
        Name = "3. حركات مخزون بدون حوكمة"
        Description = "التحقق من وجود حركات مخزون بدون warehouse_id أو branch_id"
        Priority = "P0"
    },
    @{
        Name = "4. فواتير Draft بحركات مخزون"
        Description = "التحقق من وجود فواتير مسودة لها حركات مخزون (ممنوع)"
        Priority = "P0"
    },
    @{
        Name = "5. فواتير Sent بدون حركات مخزون"
        Description = "التحقق من وجود فواتير مرسلة بدون خصم من المخزون"
        Priority = "P0"
    },
    @{
        Name = "6. فواتير Paid بدون قيود محاسبية"
        Description = "التحقق من وجود فواتير مدفوعة بدون قيود محاسبية"
        Priority = "P0"
    },
    @{
        Name = "7. حركات مخزون بدون مستودع"
        Description = "التحقق من وجود حركات مخزون بدون warehouse_id"
        Priority = "P0"
    },
    @{
        Name = "8. حركات مخزون بدون مصدر"
        Description = "التحقق من وجود حركات مخزون بدون source_type أو source_id"
        Priority = "P0"
    },
    @{
        Name = "9. قيود محاسبية غير متوازنة"
        Description = "التحقق من وجود قيود محاسبية (Debit != Credit)"
        Priority = "P0"
    }
)

# عرض قائمة الاستعلامات
foreach ($check in $criticalChecks) {
    Write-Host "[$($check.Priority)] $($check.Name)" -ForegroundColor White
    Write-Host "    $($check.Description)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "📝 تعليمات التنفيذ" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "لتشغيل الاستعلامات:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  افتح Supabase Dashboard" -ForegroundColor White
Write-Host "   https://app.supabase.com" -ForegroundColor Gray
Write-Host ""
Write-Host "2️⃣  اذهب إلى SQL Editor" -ForegroundColor White
Write-Host ""
Write-Host "3️⃣  انسخ محتوى الملف:" -ForegroundColor White
Write-Host "   .\sql\compliance-audit-queries.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "4️⃣  شغل كل استعلام على حدة" -ForegroundColor White
Write-Host ""
Write-Host "5️⃣  تحقق من النتائج:" -ForegroundColor White
Write-Host "   ✅ 0 rows = لا يوجد انتهاكات" -ForegroundColor Green
Write-Host "   ❌ > 0 rows = يوجد انتهاكات حرجة" -ForegroundColor Red
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "⚠️  تحذيرات مهمة" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "❌ أي انتهاك يعتبر Bug حرج (P0)" -ForegroundColor Red
Write-Host "❌ يجب إصلاح جميع الانتهاكات قبل الإنتاج" -ForegroundColor Red
Write-Host "❌ لا تنشر الكود حتى تصبح جميع النتائج = 0 rows" -ForegroundColor Red
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "📋 التوثيق" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "بعد تشغيل الاستعلامات، وثق النتائج في:" -ForegroundColor Yellow
Write-Host "  - COMPLIANCE_CHECKLIST.md" -ForegroundColor White
Write-Host "  - COMPLIANCE_VIOLATIONS.log (إن وجدت انتهاكات)" -ForegroundColor White
Write-Host ""

Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ انتهى التحضير" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# فتح ملف الاستعلامات في المحرر الافتراضي
$openFile = Read-Host "هل تريد فتح ملف الاستعلامات الآن؟ (y/n)"
if ($openFile -eq "y" -or $openFile -eq "Y") {
    Start-Process $sqlFile
    Write-Host "✅ تم فتح ملف الاستعلامات" -ForegroundColor Green
}

Write-Host ""
Write-Host "شكراً لاستخدام نظام مراجعة الالتزام! 🎉" -ForegroundColor Cyan
