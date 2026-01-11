# 🧪 اختبار سريع لنظام الحوكمة
# Quick Governance System Test

Write-Host "🧪 اختبار سريع لنظام الحوكمة" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
Write-Host ""

# التحقق من تحديث الملفات
$updatedFiles = @(
    "lib\data-visibility-control.ts",
    "app\api\sales-orders\route.ts"
)

Write-Host "📋 التحقق من الملفات المحدثة..." -ForegroundColor Cyan

foreach ($file in $updatedFiles) {
    if (Test-Path $file) {
        $lastWrite = (Get-Item $file).LastWriteTime
        $timeDiff = (Get-Date) - $lastWrite
        
        if ($timeDiff.TotalMinutes -lt 5) {
            Write-Host "✅ $file - محدث مؤخراً" -ForegroundColor Green
        } else {
            Write-Host "⚠️  $file - قديم" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ $file - غير موجود" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🔍 فحص محتوى نظام الحوكمة..." -ForegroundColor Cyan

# فحص ملف الحوكمة
$governanceFile = "lib\data-visibility-control.ts"
if (Test-Path $governanceFile) {
    $content = Get-Content $governanceFile -Raw
    
    if ($content -match "getRoleAccessLevel") {
        Write-Host "✅ نظام الحوكمة يستخدم getRoleAccessLevel" -ForegroundColor Green
    } else {
        Write-Host "❌ نظام الحوكمة لا يستخدم getRoleAccessLevel" -ForegroundColor Red
    }
    
    if ($content -match "filterByCreatedBy.*true") {
        Write-Host "✅ فلتر created_by_user_id مفعل للموظفين" -ForegroundColor Green
    } else {
        Write-Host "❌ فلتر created_by_user_id غير مفعل" -ForegroundColor Red
    }
    
    if ($content -match "filterByBranch.*true") {
        Write-Host "✅ فلتر branch_id مفعل" -ForegroundColor Green
    } else {
        Write-Host "❌ فلتر branch_id غير مفعل" -ForegroundColor Red
    }
} else {
    Write-Host "❌ ملف نظام الحوكمة غير موجود" -ForegroundColor Red
}

Write-Host ""
Write-Host "🔍 فحص API أوامر البيع..." -ForegroundColor Cyan

# فحص API
$apiFile = "app\api\sales-orders\route.ts"
if (Test-Path $apiFile) {
    $apiContent = Get-Content $apiFile -Raw
    
    if ($apiContent -match "getRoleAccessLevel") {
        Write-Host "✅ API يستخدم getRoleAccessLevel" -ForegroundColor Green
    } else {
        Write-Host "❌ API لا يستخدم getRoleAccessLevel" -ForegroundColor Red
    }
    
    if ($apiContent -match "created_by_user_id") {
        Write-Host "✅ API يطبق فلتر created_by_user_id" -ForegroundColor Green
    } else {
        Write-Host "❌ API لا يطبق فلتر created_by_user_id" -ForegroundColor Red
    }
    
    if ($apiContent -match "branch_id") {
        Write-Host "✅ API يطبق فلتر branch_id" -ForegroundColor Green
    } else {
        Write-Host "❌ API لا يطبق فلتر branch_id" -ForegroundColor Red
    }
} else {
    Write-Host "❌ ملف API غير موجود" -ForegroundColor Red
}

Write-Host ""
Write-Host "📊 ملخص النتائج:" -ForegroundColor Yellow

$allGood = $true

# التحقق من الملفات الأساسية
if (-not (Test-Path "lib\data-visibility-control.ts")) {
    Write-Host "❌ ملف نظام الحوكمة مفقود" -ForegroundColor Red
    $allGood = $false
}

if (-not (Test-Path "app\api\sales-orders\route.ts")) {
    Write-Host "❌ ملف API مفقود" -ForegroundColor Red
    $allGood = $false
}

if (-not (Test-Path "scripts\MANDATORY_ERP_GOVERNANCE_FIXES.sql")) {
    Write-Host "❌ سكريبت قاعدة البيانات مفقود" -ForegroundColor Red
    $allGood = $false
}

if ($allGood) {
    Write-Host ""
    Write-Host "🎯 النتيجة: ✅ جاهز للاختبار!" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 الخطوات التالية:" -ForegroundColor Cyan
    Write-Host "1. تشغيل التطبيق: npm run dev" -ForegroundColor White
    Write-Host "2. تسجيل الدخول بأدوار مختلفة" -ForegroundColor White
    Write-Host "3. اختبار صفحة أوامر البيع" -ForegroundColor White
    Write-Host "4. التحقق من الفلترة الصحيحة" -ForegroundColor White
    Write-Host ""
    Write-Host "🔐 الأدوار المطلوب اختبارها:" -ForegroundColor Yellow
    Write-Host "• Staff - يجب أن يرى أوامره فقط" -ForegroundColor White
    Write-Host "• Accountant - يجب أن يرى أوامر الفرع" -ForegroundColor White
    Write-Host "• Manager - يجب أن يرى أوامر الفرع" -ForegroundColor White
    Write-Host "• Owner/Admin - يجب أن يرى جميع الأوامر" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "🚨 النتيجة: ❌ يحتاج إصلاحات!" -ForegroundColor Red
    Write-Host "===============================" -ForegroundColor Red
    Write-Host "يرجى إصلاح المشاكل أعلاه قبل المتابعة" -ForegroundColor Red
}

Write-Host ""