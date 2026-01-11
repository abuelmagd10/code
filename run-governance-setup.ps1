# 🚀 تنفيذ نظام الحوكمة تلقائياً
# ERB VitaSlims - Auto Governance Setup

Write-Host "🔒 بدء تنفيذ نظام الحوكمة..." -ForegroundColor Cyan
Write-Host ""

# ========================================
# المرحلة 1: التحقق من الملفات
# ========================================
Write-Host "📋 المرحلة 1: التحقق من الملفات المطلوبة..." -ForegroundColor Yellow

$requiredFiles = @(
    "update-governance-data.sql",
    "app\api\sales-orders\route.ts",
    "app\api\invoices\route.ts",
    "lib\data-visibility-control.ts",
    "TESTING_GUIDE.md"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file غير موجود!" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "❌ بعض الملفات المطلوبة غير موجودة!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ جميع الملفات موجودة" -ForegroundColor Green
Write-Host ""

# ========================================
# المرحلة 2: عرض SQL للتنفيذ
# ========================================
Write-Host "📋 المرحلة 2: SQL للتنفيذ في Supabase..." -ForegroundColor Yellow
Write-Host ""
Write-Host "انسخ الكود التالي ونفذه في Supabase Dashboard > SQL Editor:" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Gray
Write-Host ""

$sqlContent = Get-Content "update-governance-data.sql" -Raw
Write-Host $sqlContent -ForegroundColor White

Write-Host ""
Write-Host "================================================================" -ForegroundColor Gray
Write-Host ""

# ========================================
# المرحلة 3: فتح Supabase Dashboard
# ========================================
$openDashboard = Read-Host "هل تريد فتح Supabase Dashboard الآن؟ (y/n)"
if ($openDashboard -eq 'y' -or $openDashboard -eq 'Y') {
    Write-Host "🌐 فتح Supabase Dashboard..." -ForegroundColor Green
    Start-Process "https://supabase.com/dashboard"
    Start-Sleep -Seconds 2
}

Write-Host ""

# ========================================
# المرحلة 4: التحقق من التنفيذ
# ========================================
Write-Host "📋 المرحلة 3: استعلامات التحقق..." -ForegroundColor Yellow
Write-Host ""
Write-Host "بعد تنفيذ SQL، نفذ هذا الاستعلام للتحقق:" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Gray
Write-Host @"
SELECT 
  'sales_orders' as table_name,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(warehouse_id) as with_warehouse,
  COUNT(created_by_user_id) as with_creator,
  ROUND(COUNT(branch_id)::numeric / COUNT(*)::numeric * 100, 2) as branch_percentage
FROM sales_orders
UNION ALL
SELECT 
  'invoices',
  COUNT(*),
  COUNT(branch_id),
  COUNT(warehouse_id),
  COUNT(created_by_user_id),
  ROUND(COUNT(branch_id)::numeric / COUNT(*)::numeric * 100, 2)
FROM invoices;
"@ -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Gray
Write-Host ""

# ========================================
# المرحلة 5: دليل الاختبار
# ========================================
Write-Host "📋 المرحلة 4: الاختبار..." -ForegroundColor Yellow
Write-Host ""
Write-Host "اتبع دليل الاختبار في: TESTING_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "اختبارات سريعة:" -ForegroundColor White
Write-Host "  1. سجل دخول كموظف (staff) - يجب أن يرى أوامره فقط" -ForegroundColor Gray
Write-Host "  2. سجل دخول كمحاسب (accountant) - يجب أن يرى أوامر الفرع" -ForegroundColor Gray
Write-Host "  3. سجل دخول كمدير (manager) - يجب أن يرى أوامر الفرع" -ForegroundColor Gray
Write-Host "  4. سجل دخول كمدير عام (owner/admin) - يجب أن يرى كل الأوامر" -ForegroundColor Gray
Write-Host ""

# ========================================
# المرحلة 6: الملخص النهائي
# ========================================
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "✅ تم الانتهاء من الإعداد!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 الخطوات المتبقية:" -ForegroundColor Yellow
Write-Host "  1. ✅ نفذ SQL في Supabase Dashboard" -ForegroundColor White
Write-Host "  2. ✅ تحقق من النتائج باستخدام استعلام التحقق" -ForegroundColor White
Write-Host "  3. ✅ اختبر النظام باتباع TESTING_GUIDE.md" -ForegroundColor White
Write-Host ""
Write-Host "📚 الملفات المرجعية:" -ForegroundColor Yellow
Write-Host "  - GOVERNANCE_REVIEW.md - مراجعة شاملة" -ForegroundColor Gray
Write-Host "  - GOVERNANCE_IMPLEMENTATION.md - دليل التطبيق" -ForegroundColor Gray
Write-Host "  - TESTING_GUIDE.md - دليل الاختبار" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 نظام الحوكمة جاهز للاستخدام!" -ForegroundColor Green
Write-Host ""
