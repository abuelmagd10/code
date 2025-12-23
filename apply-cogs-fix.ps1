# =============================================
# تطبيق تصحيح COGS على قاعدة البيانات
# =============================================
# هذا السكريبت يطبق جميع التصحيحات المحاسبية على قاعدة البيانات
# =============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  تطبيق تصحيح COGS المحاسبي" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# التحقق من وجود ملفات SQL
$files = @(
    "scripts/011_auto_cogs_trigger.sql",
    "scripts/012_fix_historical_cogs.sql",
    "scripts/enhanced_reports_system.sql"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "❌ الملف غير موجود: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ جميع الملفات موجودة" -ForegroundColor Green
Write-Host ""

# طلب معلومات الاتصال
Write-Host "📝 أدخل معلومات الاتصال بقاعدة البيانات:" -ForegroundColor Yellow
Write-Host ""

# خيار 1: استخدام Supabase
Write-Host "الخيار 1: Supabase" -ForegroundColor Cyan
Write-Host "  - افتح: https://app.supabase.com" -ForegroundColor Gray
Write-Host "  - اختر مشروعك → Settings → Database" -ForegroundColor Gray
Write-Host "  - انسخ Connection string (Direct connection)" -ForegroundColor Gray
Write-Host ""

$useSupabase = Read-Host "هل تستخدم Supabase؟ (y/n)"

if ($useSupabase -eq "y" -or $useSupabase -eq "Y") {
    Write-Host ""
    Write-Host "📋 الصق Connection String من Supabase:" -ForegroundColor Yellow
    $connectionString = Read-Host "Connection String"
    
    if ([string]::IsNullOrWhiteSpace($connectionString)) {
        Write-Host "❌ Connection String فارغ!" -ForegroundColor Red
        exit 1
    }
} else {
    # خيار 2: قاعدة بيانات محلية
    Write-Host ""
    Write-Host "الخيار 2: قاعدة بيانات محلية" -ForegroundColor Cyan
    $host_input = Read-Host "Host (default: localhost)"
    $port_input = Read-Host "Port (default: 5432)"
    $database = Read-Host "Database name"
    $username = Read-Host "Username (default: postgres)"
    $password = Read-Host "Password" -AsSecureString
    
    $host = if ([string]::IsNullOrWhiteSpace($host_input)) { "localhost" } else { $host_input }
    $port = if ([string]::IsNullOrWhiteSpace($port_input)) { "5432" } else { $port_input }
    $user = if ([string]::IsNullOrWhiteSpace($username)) { "postgres" } else { $username }
    
    # تحويل SecureString إلى نص عادي
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    $connectionString = "postgresql://${user}:${plainPassword}@${host}:${port}/${database}"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  تطبيق السكريبتات" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# تطبيق السكريبتات بالترتيب
$scriptNames = @(
    "Trigger للـ COGS التلقائي",
    "دالة إصلاح البيانات القديمة",
    "تحديث Income Statement"
)

for ($i = 0; $i -lt $files.Length; $i++) {
    $file = $files[$i]
    $name = $scriptNames[$i]
    
    Write-Host "[$($i+1)/$($files.Length)] تطبيق: $name" -ForegroundColor Yellow
    Write-Host "  الملف: $file" -ForegroundColor Gray
    
    try {
        # تطبيق السكريبت
        $env:PGPASSWORD = $plainPassword
        $result = psql $connectionString -f $file 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ تم التطبيق بنجاح" -ForegroundColor Green
        } else {
            Write-Host "  ❌ فشل التطبيق" -ForegroundColor Red
            Write-Host "  الخطأ: $result" -ForegroundColor Red
            
            $continue = Read-Host "  هل تريد المتابعة؟ (y/n)"
            if ($continue -ne "y" -and $continue -ne "Y") {
                exit 1
            }
        }
    } catch {
        Write-Host "  ❌ خطأ: $_" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  تشغيل دالة الإصلاح" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📝 أدخل Company ID لتطبيق الإصلاح:" -ForegroundColor Yellow
Write-Host "  (يمكنك الحصول عليه من جدول companies)" -ForegroundColor Gray
$companyId = Read-Host "Company ID"

if ([string]::IsNullOrWhiteSpace($companyId)) {
    Write-Host "⚠️  تم تخطي تشغيل دالة الإصلاح" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "تشغيل: fix_historical_cogs('$companyId')" -ForegroundColor Yellow
    
    try {
        $query = "SELECT * FROM fix_historical_cogs('$companyId');"
        $result = psql $connectionString -c $query 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ تم تشغيل دالة الإصلاح بنجاح" -ForegroundColor Green
            Write-Host ""
            Write-Host "النتيجة:" -ForegroundColor Cyan
            Write-Host $result
        } else {
            Write-Host "❌ فشل تشغيل دالة الإصلاح" -ForegroundColor Red
            Write-Host "الخطأ: $result" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ خطأ: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  التحقق من النجاح" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# فحص عدد قيود COGS
Write-Host "فحص قيود COGS..." -ForegroundColor Yellow
try {
    $query = "SELECT COUNT(*) as cogs_entries FROM journal_entries WHERE reference_type = 'invoice_cogs';"
    $result = psql $connectionString -t -c $query 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ عدد قيود COGS: $result" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  تعذر فحص قيود COGS" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ تم الانتهاء بنجاح!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "الخطوات التالية:" -ForegroundColor Cyan
Write-Host "1. تحقق من التقارير المالية" -ForegroundColor Gray
Write-Host "2. راجع قيود COGS في journal_entries" -ForegroundColor Gray
Write-Host "3. اختبر إنشاء فاتورة بيع جديدة" -ForegroundColor Gray
Write-Host ""
Write-Host "للمزيد من المعلومات، راجع:" -ForegroundColor Cyan
Write-Host "  - COGS_FIX_README.md" -ForegroundColor Gray
Write-Host "  - docs/COGS_ACCOUNTING_FIX.md" -ForegroundColor Gray
Write-Host ""

