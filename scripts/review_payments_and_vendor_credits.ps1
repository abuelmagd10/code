# =====================================================
# سكريبت PowerShell لمراجعة المدفوعات وإشعارات الدائن
# =====================================================

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "مراجعة المدفوعات وإشعارات الدائن يدوياً" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# قراءة معلومات الاتصال بقاعدة البيانات
$dbHost = Read-Host "أدخل عنوان قاعدة البيانات (localhost)"
$dbPort = Read-Host "أدخل المنفذ (5432)"
$dbName = Read-Host "أدخل اسم قاعدة البيانات"
$dbUser = Read-Host "أدخل اسم المستخدم"

# قراءة كلمة المرور بشكل آمن
$securePassword = Read-Host "أدخل كلمة المرور" -AsSecureString
$dbPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword))

Write-Host ""
Write-Host "اختر نوع المراجعة:" -ForegroundColor Yellow
Write-Host "1. مراجعة شاملة (جميع المدفوعات وإشعارات الدائن)"
Write-Host "2. مراجعة المدفوعات الكبيرة والمشبوهة"
Write-Host "3. كلا النوعين"
Write-Host ""

$choice = Read-Host "اختر رقم الخيار (1-3)"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "تشغيل المراجعة الشاملة..." -ForegroundColor Green
        $sqlScript = Join-Path $scriptPath "review_payments_and_vendor_credits.sql"
        $env:PGPASSWORD = $dbPassword
        & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlScript
        Remove-Item Env:\PGPASSWORD
    }
    "2" {
        Write-Host ""
        Write-Host "تشغيل مراجعة المدفوعات الكبيرة والمشبوهة..." -ForegroundColor Green
        $sqlScript = Join-Path $scriptPath "review_specific_payments.sql"
        $env:PGPASSWORD = $dbPassword
        & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlScript
        Remove-Item Env:\PGPASSWORD
    }
    "3" {
        Write-Host ""
        Write-Host "تشغيل المراجعة الشاملة..." -ForegroundColor Green
        $sqlScript1 = Join-Path $scriptPath "review_payments_and_vendor_credits.sql"
        $env:PGPASSWORD = $dbPassword
        & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlScript1
        Write-Host ""
        Write-Host "تشغيل مراجعة المدفوعات الكبيرة والمشبوهة..." -ForegroundColor Green
        $sqlScript2 = Join-Path $scriptPath "review_specific_payments.sql"
        & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlScript2
        Remove-Item Env:\PGPASSWORD
    }
    default {
        Write-Host "خيار غير صحيح!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "اكتملت المراجعة" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "يرجى مراجعة النتائج وتحديد المشاكل المحتملة." -ForegroundColor Yellow
Write-Host "راجع دليل المراجعة اليدوية: docs/MANUAL_REVIEW_GUIDE.md" -ForegroundColor Yellow
