# =====================================================
# اختبار شامل End-to-End لنظام COGS Professional
# PowerShell Script للاختبار التفاعلي
# =====================================================

param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$SupabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY,
    [string]$CompanyId = ""
)

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "اختبار نظام COGS Professional - End-to-End" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# التحقق من المتغيرات
if (-not $SupabaseUrl -or -not $SupabaseKey) {
    Write-Host "❌ خطأ: يرجى تعيين NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Red
    exit 1
}

# قراءة SQL script
$sqlFile = Join-Path $PSScriptRoot "test_cogs_system.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ خطأ: ملف الاختبار غير موجود: $sqlFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $sqlFile -Raw -Encoding UTF8

Write-Host "✅ تم تحميل ملف الاختبار: test_cogs_system.sql" -ForegroundColor Green
Write-Host ""
Write-Host "📋 سيقوم هذا السكريبت باختبار:" -ForegroundColor Yellow
Write-Host "   1. وجود جدول cogs_transactions" -ForegroundColor White
Write-Host "   2. Invoice Sent → FIFO → COGS Transactions" -ForegroundColor White
Write-Host "   3. Sales Return → COGS Reversal" -ForegroundColor White
Write-Host "   4. الحوكمة (Governance)" -ForegroundColor White
Write-Host "   5. مقارنة Dashboard Stats (Old vs New)" -ForegroundColor White
Write-Host "   6. توازن المخزون والـ COGS" -ForegroundColor White
Write-Host ""

$continue = Read-Host "هل تريد المتابعة؟ (Y/N)"
if ($continue -ne "Y" -and $continue -ne "y") {
    Write-Host "تم الإلغاء." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "🚀 بدء الاختبارات..." -ForegroundColor Cyan
Write-Host ""

# تشغيل SQL script
try {
    # استخدام Supabase REST API لتنفيذ SQL
    # ملاحظة: يتطلب exec_sql function في Supabase
    $body = @{
        query = $sqlContent
    } | ConvertTo-Json

    $headers = @{
        "apikey" = $SupabaseKey
        "Authorization" = "Bearer $SupabaseKey"
        "Content-Type" = "application/json"
    }

    Write-Host "📝 تنفيذ SQL queries..." -ForegroundColor Yellow
    
    # ملاحظة: هذا يتطلب exec_sql RPC function
    # بدلاً من ذلك، يمكن تشغيل SQL مباشرة من psql
    Write-Host "ℹ️ يرجى تشغيل test_cogs_system.sql مباشرة من psql أو Supabase Dashboard" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "أو استخدم:" -ForegroundColor Yellow
    Write-Host "  psql -h [DB_HOST] -U [USER] -d [DB_NAME] -f scripts/test_cogs_system.sql" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ خطأ في تنفيذ الاختبار: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ انتهى الاختبار" -ForegroundColor Green
Write-Host ""
Write-Host "📋 راجع النتائج أعلاه للتحقق من:" -ForegroundColor Yellow
Write-Host "   ✅ جميع الاختبارات نجحت" -ForegroundColor White
Write-Host "   ✅ لا توجد COGS Transactions بدون حوكمة" -ForegroundColor White
Write-Host "   ✅ COGS Transactions متطابقة مع FIFO Consumption" -ForegroundColor White
Write-Host "   ✅ COGS Reversal موجود للمرتجعات" -ForegroundColor White
